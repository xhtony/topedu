import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailService } from './email.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { SignOptions } from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private getAccessExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  private getRefreshExpiresInDays(): number {
    return Number(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '30'));
  }

  private getEmailVerificationExpiresInMinutes(): number {
    return Number(this.configService.get<string>('EMAIL_VERIFICATION_EXPIRES_IN_MINUTES', '30'));
  }

  private getEmailVerificationResendCooldownSeconds(): number {
    return Number(
      this.configService.get<string>('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', '60'),
    );
  }

  private getEmailVerificationBaseUrl(): string {
    const configured = this.configService.get<string>('EMAIL_VERIFICATION_BASE_URL');
    if (configured) {
      return configured;
    }

    const frontendOrigin = this.configService.get<string>('FRONTEND_ORIGIN', 'http://localhost:5500');
    return `${frontendOrigin.replace(/\/+$/, '')}/verify-email.html`;
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is required');
    }
    return secret;
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private sanitizeUser(user: { id: string; email: string; name: string; emailVerified: boolean }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    };
  }

  private getEmailVerificationExpiryDate() {
    const expiresInMinutes = this.getEmailVerificationExpiresInMinutes();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + expiresInMinutes);
    return expiry;
  }

  private buildEmailVerificationLink(rawToken: string): string {
    const baseUrl = this.getEmailVerificationBaseUrl();
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${encodeURIComponent(rawToken)}`;
  }

  private async createEmailVerificationToken(userId: string) {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = this.getEmailVerificationExpiryDate();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
      },
    });

    return { rawToken, expiresAt };
  }

  private async sendEmailVerification(email: string, rawToken: string) {
    const verificationLink = this.buildEmailVerificationLink(rawToken);
    await this.emailService.sendEmailVerification(email, verificationLink);
  }

  private async signAccessToken(payload: JwtPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: this.getAccessExpiresIn() as SignOptions['expiresIn'],
    });
  }

  private async signRefreshToken(payload: JwtPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: `${this.getRefreshExpiresInDays()}d` as SignOptions['expiresIn'],
    });
  }

  private getRefreshExpiryDate() {
    const expiresInDays = this.getRefreshExpiresInDays();
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + expiresInDays);
    return expiry;
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    const { rawToken } = await this.createEmailVerificationToken(user.id);
    await this.sendEmailVerification(user.email, rawToken);

    return {
      user: this.sanitizeUser(user),
      message: 'Registration successful. Please verify your email before login.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token.trim());
    const storedToken = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken || storedToken.expiresAt.getTime() <= Date.now() || storedToken.usedAt) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: storedToken.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: now,
        },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: storedToken.id },
        data: { usedAt: now },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: {
          userId: storedToken.userId,
          usedAt: null,
          NOT: { id: storedToken.id },
        },
        data: { usedAt: now },
      }),
    ]);

    return { success: true, message: 'Email verified successfully' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.emailVerified) {
      return {
        success: true,
        message: 'If the account exists and is unverified, a verification email has been sent.',
      };
    }

    const latestActiveToken = await this.prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latestActiveToken) {
      const cooldownMs = this.getEmailVerificationResendCooldownSeconds() * 1000;
      const availableAt = latestActiveToken.createdAt.getTime() + cooldownMs;
      if (availableAt > Date.now()) {
        throw new BadRequestException('Please wait before requesting another verification email');
      }
    }

    const { rawToken } = await this.createEmailVerificationToken(user.id);
    await this.sendEmailVerification(user.email, rawToken);

    return { success: true, message: 'Verification email sent' };
  }

  async login(dto: LoginDto, metadata: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email is not verified');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.signRefreshToken(payload);
    const refreshTokenHash = this.hashToken(refreshToken);
    const refreshTokenExpiresAt = this.getRefreshExpiryDate();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(refreshToken: string, metadata: { ip?: string; userAgent?: string }) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token is expired or revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email is not verified');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this.signAccessToken(newPayload);
    const newRefreshToken = await this.signRefreshToken(newPayload);
    const newRefreshExpiresAt = this.getRefreshExpiryDate();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(newRefreshToken),
        expiresAt: newRefreshExpiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ip,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: newRefreshExpiresAt,
      user: this.sanitizeUser(user),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { success: true };
    }

    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user: this.sanitizeUser(user) };
  }
}
