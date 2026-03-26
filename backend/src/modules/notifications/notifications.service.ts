import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
  ) {}

  // --- In-App Notifications ---

  async createNotification(userId: string, data: { type: string; title: string; message: string; metadata?: any }) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata || {},
        },
      });
    } catch (e) {
      this.logger.error(`Failed to create notification for user ${userId}`, e);
    }
  }

  async getForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
  
  async delete(id: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: { id, userId },
    });
  }

  // --- Cron Jobs & Email Notifications ---
  @Cron('0 8 1 * *', {
    name: 'monthly-summary',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendMonthlySummary() {
    this.logger.log('Starting monthly summary cron job...');
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    const families = await this.prisma.family.findMany({
      include: { users: true },
    });

    for (const family of families) {
      const emails = family.users
        .map((u) => u.email)
        .filter((e) => e && this.isValidEmail(e));

      if (emails.length === 0) continue;

      // Use eventsService to get actual DB events + Holidays + Birthdays
      const events = await this.eventsService.findAll(family.id, currentMonth, currentYear);

      if (events.length > 0) {
        const html = this.buildMonthlyEmailHtml(family.name, currentMonth, events);
        await this.mailService.sendMail(
          emails,
          `[Family Calendar] Tổng hợp sự kiện tháng ${currentMonth}`,
          html,
        );
      }
    }
  }

  // 2. Cron Job: 8:00 AM every day
  @Cron('0 8 * * *', {
    name: 'daily-reminder',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendDailyReminder() {
    this.logger.log('Starting daily reminder cron job...');
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentDay = now.getDate();

    const families = await this.prisma.family.findMany({
      include: { users: true },
    });

    for (const family of families) {
      const emails = family.users
        .map((u) => u.email)
        .filter((e) => e && this.isValidEmail(e));

      if (emails.length === 0) continue;

      // Get all events for the month (includes virtual events), then filter for today
      const allEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear);
      const todayEvents = allEvents.filter(
        (e) => new Date(e.date).getDate() === currentDay,
      );

      if (todayEvents.length > 0) {
        const html = this.buildDailyEmailHtml(family.name, todayEvents);
        await this.mailService.sendMail(
          emails,
          `[Family Calendar] Nhắc nhở sự kiện hôm nay - ${currentDay}/${currentMonth}`,
          html,
        );
      }
    }
  }

  private isValidEmail(email: string): boolean {
    const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return rx.test(email);
  }

  private buildMonthlyEmailHtml(familyName: string, month: number, events: any[]): string {
    const eventsList = events
      .map((e) => {
        const dateStr = `${new Date(e.date).getDate()}/${month}`;
        let desc = e.description ? `(<em>${e.description}</em>)` : '';
        return `<li><strong>${dateStr}:</strong> ${e.title} ${desc}</li>`;
      })
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4f46e5;">Xin chào gia đình ${familyName},</h2>
        <p>Tháng ${month} này gia đình chúng ta có <strong>${events.length} sự kiện</strong> sắp diễn ra:</p>
        <ul style="line-height: 1.6;">${eventsList}</ul>
        <br/>
        <p>Chúc đại gia đình một tháng mới tràn đầy niềm vui và hạnh phúc!</p>
        <hr style="border: none; border-top: 1px solid #ccc;" />
        <small style="color: #666;">Tin nhắn tự động từ ứng dụng Family Calendar</small>
      </div>
    `;
  }

  private buildDailyEmailHtml(familyName: string, events: any[]): string {
    const eventsList = events
      .map((e) => {
        let desc = e.description ? `<br/><span style="color: #666; font-size: 0.9em;">- ${e.description}</span>` : '';
        return `<li style="margin-bottom: 10px;"><strong>${e.title}</strong>${desc}</li>`;
      })
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #10b981;">Xin chào gia đình ${familyName},</h2>
        <p>Đừng quên hôm nay chúng ta có các sự kiện sau diễn ra:</p>
        <ul style="line-height: 1.6;">${eventsList}</ul>
        <br/>
        <p>Chúc đại gia đình một ngày tuyệt vời!</p>
        <hr style="border: none; border-top: 1px solid #ccc;" />
        <small style="color: #666;">Tin nhắn tự động từ ứng dụng Family Calendar</small>
      </div>
    `;
  }
}
