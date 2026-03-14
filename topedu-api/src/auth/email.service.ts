import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is required`);
    }
    return value;
  }

  private async createTransport() {
    const host = this.getRequiredEnv('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
    const secure = this.configService.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = this.getRequiredEnv('SMTP_USER');
    const pass = this.getRequiredEnv('SMTP_PASS');
    const resolved = await lookup(host, { family: 4 });

    return nodemailer.createTransport({
      host: resolved.address,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        // Keep the original hostname for TLS certificate validation.
        servername: host,
      },
    });
  }

  async sendEmailVerification(email: string, verificationLink: string) {
    const from = this.getRequiredEnv('SMTP_FROM');
    const transporter = await this.createTransport();

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your TopEdu email',
      text: `Welcome to TopEdu!\n\nPlease verify your email by opening this link:\n${verificationLink}\n\nIf you did not create this account, you can ignore this email.`,
      html: `
        <p>Welcome to TopEdu!</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      `,
    });
  }
}
