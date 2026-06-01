import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailService } from './email.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { mapStudentWalletResponse } from '../common/currency.util';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
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

  /* ───────── Config helpers ───────── */

  private getAccessExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  private getRefreshExpiresInDays(): number {
    return Number(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '30'));
  }

  private getPasswordResetExpiresInMinutes(): number {
    return Number(this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN_MINUTES', '10'));
  }

  private getPasswordResetResendCooldownSeconds(): number {
    return Number(this.configService.get<string>('PASSWORD_RESET_RESEND_COOLDOWN_SECONDS', '60'));
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is required');
    return secret;
  }

  /* ───────── Token helpers ───────── */

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private sanitizeUser(user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: any;
    gender: string | null;
    mustChangePassword: boolean;
    walletCurrency?: any;
    prepaymentCny?: any;
    prepaymentNzd?: any;
    balanceCny?: any;
    balanceNzd?: any;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      gender: user.gender,
      mustChangePassword: user.mustChangePassword,
      walletCurrency: user.walletCurrency ?? null,
      prepaymentCny: Number(user.prepaymentCny ?? 0),
      prepaymentNzd: Number(user.prepaymentNzd ?? 0),
      balanceCny: Number(user.balanceCny ?? 0),
      balanceNzd: Number(user.balanceNzd ?? 0),
    };
  }

  private async sanitizeUserForResponse(user: {
    id: string;
    username: string;
    email: string | null;
    name: string;
    role: any;
    gender: string | null;
    mustChangePassword: boolean;
    walletCurrency?: any;
    prepaymentCny?: any;
    prepaymentNzd?: any;
    balanceCny?: any;
    balanceNzd?: any;
  }) {
    const base = this.sanitizeUser(user);
    if (user.role !== 'STUDENT') {
      return base;
    }
    const [cnyAgg, nzdAgg, countCny, countNzd] = await Promise.all([
      this.prisma.attendance.aggregate({
        where: { userId: user.id, currency: 'CNY' },
        _sum: { feeDeducted: true },
      }),
      this.prisma.attendance.aggregate({
        where: { userId: user.id, currency: 'NZD' },
        _sum: { feeDeducted: true },
      }),
      this.prisma.attendance.count({ where: { userId: user.id, currency: 'CNY' } }),
      this.prisma.attendance.count({ where: { userId: user.id, currency: 'NZD' } }),
    ]);
    return {
      ...base,
      ...mapStudentWalletResponse(
        {
          prepaymentCny: user.prepaymentCny ?? 0,
          prepaymentNzd: user.prepaymentNzd ?? 0,
          walletCurrency: user.walletCurrency ?? null,
        },
        Number(cnyAgg._sum.feeDeducted ?? 0),
        Number(nzdAgg._sum.feeDeducted ?? 0),
        countCny,
        countNzd,
      ),
    };
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
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.getRefreshExpiresInDays());
    return expiry;
  }

  private getPasswordResetExpiryDate() {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + this.getPasswordResetExpiresInMinutes());
    return expiry;
  }

  private generatePasswordResetCode() {
    return String(randomInt(0, 1000000)).padStart(6, '0');
  }

  /* ───────── Admin seed ───────── */

  private async ensureAdminAccount() {
    const username = AuthService.ADMIN_NAME;
    const existing = await this.prisma.user.findUnique({ where: { username } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(AuthService.ADMIN_INITIAL_PASSWORD, 12);
      await this.prisma.user.create({
        data: {
          username,
          name: AuthService.ADMIN_NAME,
          email: AuthService.ADMIN_EMAIL.toLowerCase().trim(),
          passwordHash,
          role: 'ADMIN',
          mustChangePassword: true,
        },
      });
      return;
    }

    if (existing.role !== 'ADMIN') {
      await this.prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
    }
  }

  /* ───────── Auth flows ───────── */

  async login(dto: LoginDto, metadata: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, username: user.username, name: user.name, role: user.role };

    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.signRefreshToken(payload);
    const refreshTokenExpiresAt = this.getRefreshExpiryDate();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: await this.sanitizeUserForResponse(user),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const validCurrent = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!validCurrent) throw new BadRequestException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.email) {
      return { success: true, message: 'If the account exists, a verification code has been sent.' };
    }

    const latestActive = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latestActive) {
      const cooldownMs = this.getPasswordResetResendCooldownSeconds() * 1000;
      const remainingMs = latestActive.createdAt.getTime() + cooldownMs - Date.now();
      if (remainingMs > 0) {
        throw new BadRequestException({
          message: 'Please wait before requesting another code',
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        });
      }
    }

    const rawCode = this.generatePasswordResetCode();
    const expiresAt = this.getPasswordResetExpiryDate();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hashToken(rawCode), expiresAt } });
    });
    await this.emailService.sendPasswordResetCode(user.email, rawCode);

    return {
      success: true,
      message: 'If the account exists, a verification code has been sent.',
      retryAfterSeconds: this.getPasswordResetResendCooldownSeconds(),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('Invalid verification code or email');

    const codeHash = this.hashToken(dto.code.trim());
    const token = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash: codeHash, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, mustChangePassword: false } }),
      this.prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: now } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, NOT: { id: token.id } },
        data: { usedAt: now },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);

    return { success: true, message: 'Password reset successful. Please login again.' };
  }

  async refresh(refreshToken: string, metadata: { ip?: string; userAgent?: string }) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, { secret: this.getRefreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token is expired or revoked');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const newPayload: JwtPayload = { sub: user.id, username: user.username, name: user.name, role: user.role };
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

    return { accessToken, refreshToken: newRefreshToken, refreshTokenExpiresAt: newRefreshExpiresAt, user: this.sanitizeUser(user) };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { success: true };
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return { user: await this.sanitizeUserForResponse(user) };
  }
}
