import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

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

  private configureSendGrid() {
    const apiKey = this.getRequiredEnv('SENDGRID_API_KEY');
    sgMail.setApiKey(apiKey);
  }

  async sendEmailVerification(email: string, verificationLink: string) {
    this.configureSendGrid();
    const from = this.getRequiredEnv('SENDGRID_FROM_EMAIL');

    await sgMail.send({
      to: email,
      from,
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

  async sendPasswordResetCode(email: string, code: string) {
    this.configureSendGrid();
    const from = this.getRequiredEnv('SENDGRID_FROM_EMAIL');

    await sgMail.send({
      to: email,
      from,
      subject: 'TopEdu password reset verification code',
      text: `Your TopEdu password reset verification code is: ${code}\n\nIf you did not request a password reset, you can ignore this email.`,
      html: `
        <p>Your TopEdu password reset verification code is:</p>
        <p style="font-size: 22px; font-weight: bold; letter-spacing: 2px;">${code}</p>
        <p>If you did not request a password reset, you can ignore this email.</p>
      `,
    });
  }
}
