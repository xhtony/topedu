import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailService } from './email.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { SignOptions } from 'jsonwebtoken';

@Injectable()
export class AuthService implements OnModuleInit {
  private static readonly ADMIN_NAME = 'admin';
  private static readonly ADMIN_EMAIL = 'topedu.co.nz@gmail.com';
  private static readonly ADMIN_INITIAL_PASSWORD = '88888888';

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.ensureAdminAccount();
  }

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

  private getPasswordResetExpiresInMinutes(): number {
    return Number(this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN_MINUTES', '10'));
  }

  private getPasswordResetResendCooldownSeconds(): number {
    return Number(this.configService.get<string>('PASSWORD_RESET_RESEND_COOLDOWN_SECONDS', '60'));
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

  private sanitizeUser(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    mustChangePassword: boolean;
    emailVerified: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      emailVerified: user.emailVerified,
    };
  }

  private async ensureAdminAccount() {
    const email = AuthService.ADMIN_EMAIL.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash(AuthService.ADMIN_INITIAL_PASSWORD, 12);
      await this.prisma.user.create({
        data: {
          name: AuthService.ADMIN_NAME,
          email,
          passwordHash,
          role: 'ADMIN',
          mustChangePassword: true,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      return;
    }

    if (existing.role !== 'ADMIN') {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN' },
      });
    }
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
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = this.getEmailVerificationExpiryDate();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }

      await tx.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: this.hashToken(rawToken),
          expiresAt,
        },
      });
    });

    return { rawToken, expiresAt };
  }

  private async createRefreshTokenRecord(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    metadata: { ip?: string; userAgent?: string },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      await tx.refreshToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ip,
        },
      });
    });
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

  private getPasswordResetExpiryDate() {
    const expiresInMinutes = this.getPasswordResetExpiresInMinutes();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + expiresInMinutes);
    return expiry;
  }

  private generatePasswordResetCode() {
    return String(randomInt(0, 1000000)).padStart(6, '0');
  }

  private async createPasswordResetCode(userId: string) {
    const rawCode = this.generatePasswordResetCode();
    const expiresAt = this.getPasswordResetExpiryDate();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }

      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: this.hashToken(rawCode),
          expiresAt,
        },
      });
    });
    return { rawCode, expiresAt };
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
    const storedToken = await this.prisma.emailVerificationToken.findFirst({
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.emailVerified) {
      return {
        success: true,
        message: 'If the account exists, a verification code has been sent.',
      };
    }

    const latestActiveCode = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latestActiveCode) {
      const cooldownMs = this.getPasswordResetResendCooldownSeconds() * 1000;
      const availableAt = latestActiveCode.createdAt.getTime() + cooldownMs;
      if (availableAt > Date.now()) {
        throw new BadRequestException('Please wait before requesting another code');
      }
    }

    const { rawCode } = await this.createPasswordResetCode(user.id);
    await this.emailService.sendPasswordResetCode(user.email, rawCode);

    return {
      success: true,
      message: 'If the account exists, a verification code has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid verification code or email');
    }

    const codeHash = this.hashToken(dto.code.trim());
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        tokenHash: codeHash,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          NOT: { id: token.id },
        },
        data: { usedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    return { success: true, message: 'Password reset successful. Please login again.' };
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

    await this.createRefreshTokenRecord(user.id, refreshTokenHash, refreshTokenExpiresAt, metadata);

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: this.sanitizeUser(user),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const validCurrent = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!validCurrent) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    return { success: true, message: 'Password updated successfully' };
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

    await this.createRefreshTokenRecord(
      user.id,
      this.hashToken(newRefreshToken),
      newRefreshExpiresAt,
      metadata,
    );

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
