import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

  }

  async sendMail(to: string | string[], subject: string, html: string) {
    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        this.logger.warn('Email credentials not configured in .env. Skipping email send.');
        return;
      }

      const info = await this.transporter.sendMail({
        from: `"Family Calendar" <${process.env.EMAIL_USER}>`,
        to: Array.isArray(to) ? to.join(',') : to,
        subject,
        html,
      });

      this.logger.log(`Email sent: ${info.messageId}`);
    } catch (error) {
      this.logger.error('Error sending email', error);
    }
  }
}
