import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
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

  async sendWelcomeEmail(email: string, name: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const subject = 'Chào mừng bạn đến với Family Calendar! 🏠';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #e11d48; text-align: center;">Chào mừng ${name}!</h2>
        <p>Tài khoản của bạn đã được khởi tạo thành công trên hệ thống <b>Family Calendar</b>.</p>
        <p>Nguyên đã tạo cho bạn một không gian riêng để cả nhà mình cùng kết nối và chia sẻ những khoảnh khắc tuyệt vời.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><b>Hệ thống:</b> Quản lý gia đình & Lên kế hoạch bữa ăn</p>
          <p style="margin: 5px 0 0 0;"><b>Email đăng nhập:</b> ${email}</p>
        </div>
        <p>Hãy đăng nhập và khám phá ngay nhé!</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${frontendUrl}" style="background-color: #e11d48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Đăng nhập ngay</a>
        </div>
        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">© 2026 Family Calendar Team. Kết nối tình thân.</p>
      </div>
    `;
    return this.sendMail(email, subject, html);
  }

  async sendFamilyAddedEmail(email: string, name: string, familyName: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const subject = `Bạn đã được thêm vào gia đình ${familyName}! 👥`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #2563eb; text-align: center;">Chào ${name}!</h2>
        <p>Bạn vừa được mời tham gia vào gia đình <b>${familyName}</b> trên <b>Family Calendar</b>.</p>
        <p>Từ bây giờ, bạn có thể xem danh sách thành viên, cùng lên thực đơn món ngon mỗi ngày và theo dõi các sự kiện chung của gia đình mình.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${frontendUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Truy cập Gia đình</a>
        </div>
        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">© 2026 Family Calendar Team. Mỗi bữa cơm đều là một niềm hạnh phúc.</p>
      </div>
    `;
    return this.sendMail(email, subject, html);
  }

  async sendEventNotificationEmail(emails: string[], eventDetails: { title: string, date: string, description?: string, creatorName: string }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const subject = `📢 Sự kiện gia đình mới: ${eventDetails.title}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #6366f1; text-align: center;">Thông báo sự kiện mới!</h2>
        <p><b>${eventDetails.creatorName}</b> vừa thêm một sự kiện mới cho gia đình:</p>
        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1e293b;">${eventDetails.title}</h3>
          <p><b>📅 Ngày:</b> ${eventDetails.date}</p>
          ${eventDetails.description ? `<p><b>📝 Mô tả:</b> ${eventDetails.description}</p>` : ''}
        </div>
        <p>Hãy truy cập lịch để xem chi tiết và chuẩn bị nhé!</p>
        <div style="text-align: center; margin-top: 30px;">
        <div style="text-align: center; margin-top: 30px;">
          <a href="${frontendUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 12px; font-weight: bold;">Xem trên Lịch</a>
        </div>
        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">© 2026 Family Calendar Team. Kết nối tình thân.</p>
      </div>
    `;
    return this.sendMail(emails, subject, html);
  }

  async sendHoroscopeEmail(email: string, name: string, horoscope: string) {
    const subject = `🔮 Tử vi ngày mới cho ${name}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e1b4b; color: #f8fafc; border-radius: 20px; overflow: hidden; border: 2px solid #f59e0b;">
        <div style="padding: 40px 20px; text-align: center; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);">
          <div style="font-size: 50px; margin-bottom: 10px;">🔮</div>
          <h1 style="margin: 0; color: #f59e0b; letter-spacing: 2px; text-transform: uppercase; font-size: 24px;">Tử Vi Ngày Mới</h1>
          <p style="color: #94a3b8; margin-top: 10px;">Dành riêng cho Super Admin <b>${name}</b></p>
        </div>
        
        <div style="padding: 30px; line-height: 1.6; font-size: 16px; background-color: rgba(255, 255, 255, 0.03);">
          <div style="color: #cbd5e1;">
            ${horoscope}
          </div>
        </div>

        <div style="padding: 20px; text-align: center; background-color: #1e1b4b; border-top: 1px solid rgba(245, 158, 11, 0.2);">
          <p style="margin: 0; font-size: 14px; color: #94a3b8;">"Vận mệnh nằm trong tay bạn, các vì sao chỉ dẫn lối."</p>
          <hr style="margin: 20px 0; border: 0; border-top: 1px solid rgba(245, 158, 11, 0.1);" />
          <p style="font-size: 11px; color: #64748b;">© 2026 Family Calendar AI Assistant • Thông tin mang tính chất tham khảo chiêm nghiệm.</p>
        </div>
      </div>
    `;
    return this.sendMail(email, subject, html);
  }

  async sendFinanceReportEmail(email: string, name: string, month: number, year: number, data: any) {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const subject = `📊 Báo cáo chi tiêu tháng ${month}/${year} - ${name}`;
    
    const categoryRows = data.categories.map((c: any) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7; color: #4a5568;">${c.category}</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: bold; color: #2d3748;">${formatCurrency(c.amount)}</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #edf2f7; text-align: right; color: #718096; font-size: 12px;">${Math.round(c.percentage)}%</td>
      </tr>
    `).join('');

    const topExpenseRows = data.topExpenses.map((e: any) => `
      <div style="padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: bold; color: #2d3748;">${e.description || 'Không tên'}</span>
          <span style="color: #e53e3e; font-weight: bold;">-${formatCurrency(e.amount)}</span>
        </div>
        <div style="font-size: 11px; color: #a0aec0; margin-top: 4px;">${new Date(e.date).toLocaleDateString('vi-VN')} • ${e.category}</div>
      </div>
    `).join('');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f7fafc; padding: 20px;">
        <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <div style="background: #4f46e5; padding: 30px; text-align: center; color: white;">
            <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
            <h1 style="margin: 0; font-size: 24px; font-weight: 800;">TỔNG KẾT CHI TIÊU</h1>
            <p style="margin: 5px 0 0; opacity: 0.8;">Tháng ${month} năm ${year}</p>
          </div>

          <!-- Summary Cards -->
          <div style="padding: 24px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
              <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; border: 1px solid #bbf7d0;">
                <p style="margin: 0; font-size: 11px; color: #166534; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tổng Thu</p>
                <p style="margin: 4px 0 0; font-size: 18px; font-weight: 800; color: #15803d;">+${formatCurrency(data.totalIncome)}</p>
              </div>
              <div style="background: #fef2f2; padding: 16px; border-radius: 12px; border: 1px solid #fecaca;">
                <p style="margin: 0; font-size: 11px; color: #991b1b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tổng Chi</p>
                <p style="margin: 4px 0 0; font-size: 18px; font-weight: 800; color: #b91c1c;">-${formatCurrency(data.totalExpense)}</p>
              </div>
            </div>

            <div style="background: ${data.netSavings >= 0 ? '#4f46e5' : '#e11d48'}; padding: 20px; border-radius: 12px; color: white; text-align: center; margin-bottom: 30px;">
              <p style="margin: 0; font-size: 12px; opacity: 0.9; font-weight: bold; text-transform: uppercase;">Dư nợ cuối tháng</p>
              <p style="margin: 5px 0 0; font-size: 28px; font-weight: 900;">${formatCurrency(data.netSavings)}</p>
            </div>

            <!-- Categories -->
            <h3 style="font-size: 16px; font-weight: 800; color: #1a202c; margin: 0 0 12px; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">PHÂN BỔ CHI TIÊU</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
              ${categoryRows}
            </table>

            <!-- Top Expenses -->
            <h3 style="font-size: 16px; font-weight: 800; color: #1a202c; margin: 0 0 12px; border-bottom: 2px solid #edf2f7; padding-bottom: 8px;">GIAO DỊCH LỚN NHẤT</h3>
            <div style="margin-bottom: 20px;">
              ${topExpenseRows}
            </div>

            <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px dashed #cbd5e1; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #64748b;">Trong tháng này, bạn đã thực hiện tổng cộng <b>${data.transactionCount}</b> giao dịch.</p>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding: 24px; background: #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0;">Chào mừng tháng mới với nhiều dự định tài chính mới!</p>
            <p style="margin: 5px 0 0;">Family Calendar Assistant • Trợ lý tài chính 4.0</p>
          </div>
        </div>
      </div>
    `;

    return this.sendMail(email, subject, html);
  }
}
