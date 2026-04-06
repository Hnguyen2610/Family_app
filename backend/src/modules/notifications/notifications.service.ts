import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';
import { WebPushService } from './web-push.service';
import { AiAgentService } from '../ai-agent/services/ai-agent.service';
import { FinanceService } from '../finance/services/finance.service';
import { getLunarDateObject } from '../../utils/lunar-calendar.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly webPushService: WebPushService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
    private readonly aiAgentService: AiAgentService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
  ) {}

  // --- In-App Notifications ---

  async createNotification(userId: string, data: { type: string; title: string; message: string; metadata?: any }) {
    try {
      const dbNotification = await this.prisma.notification.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata || {},
        },
      });

      // Send Web Push
      await this.webPushService.sendToUser(userId, {
        title: data.title,
        body: data.message,
        url: data.metadata?.path || '/'
      });

      return dbNotification;
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

  // 0. Cron Job: 7:00 AM every day - Super Admin Horoscope
  @Cron('0 7 * * *', {
    name: 'super-admin-horoscope',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendSuperAdminDailyHoroscope() {
    this.logger.log('Starting Super Admin daily horoscope cron job...');
    try {
      const superAdmins = await this.prisma.user.findMany({
        where: { globalRole: 'SUPER_ADMIN' },
      });

      this.logger.log(`Found ${superAdmins.length} Super Admins to process.`);

      for (const admin of superAdmins) {
        // Generate Horoscope using AI (Gemini)
        const horoscope = await this.aiAgentService.generateHoroscope(admin.name, admin.birthday || undefined);
        
        // Send Email
        await this.mailService.sendHoroscopeEmail(admin.email, admin.name, horoscope);

        // Send Push Notification
        await this.createNotification(admin.id, {
          type: 'HOROSCOPE',
          title: '🔮 Tử vi ngày mới',
          message: 'Bản tin tử vi ngày mới của bạn đã sẵn sàng! Chúc bạn một ngày tốt lành.',
          metadata: { path: '/profile' }
        });

        this.logger.log(`Successfully sent daily horoscope to ${admin.name} (${admin.email})`);
      }
    } catch (error) {
      this.logger.error('Error in Super Admin daily horoscope cron job', error);
    }
    this.logger.log('Super Admin daily horoscope cron job finished.');
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

    this.logger.log(`Found ${families.length} families to process for monthly summary.`);

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
        this.logger.log(`Sent monthly summary to ${emails.length} users in family "${family.name}"`);

        // Send Push to everyone
        for (const user of family.users) {
          if (user.id) {
            await this.webPushService.sendToUser(user.id, {
              title: `📅 Tổng hợp sự kiện tháng ${currentMonth}`,
              body: `Gia đình ${family.name} có ${events.length} sự kiện sắp diễn ra trong tháng này.`,
              url: '/calendar'
            });
          }
        }
      }
    }
    this.logger.log(`Monthly summary cron job finished. Processed ${families.length} families.`);
  }

  // 1.5. Cron Job: 9:00 PM every day - Check for Last Day of Month Finance Report
  @Cron('0 21 * * *', {
    name: 'monthly-finance-report',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendMonthlyFinanceReport() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    // If tomorrow is the 1st, then today is the last day of the month
    if (tomorrow.getDate() !== 1) {
      this.logger.log('Not the last day of the month. Skipping finance report.');
      return;
    }

    this.logger.log('Starting last-day-of-month finance report cron job...');
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const users = await this.prisma.user.findMany();

    for (const user of users) {
      try {
        if (!user.email) continue;

        // Generate Report Data
        const reportData = await this.financeService.getMonthlyReportData(user.id, month, year);

        if (reportData.transactionCount === 0) continue;

        // Send Email
        await this.mailService.sendFinanceReportEmail(user.email, user.name, month, year, reportData);

        // Send Push Notification
        await this.webPushService.sendToUser(user.id, {
          title: `📊 Báo cáo chi tiêu tháng ${month}`,
          body: `Tổng kết tháng này: Bạn đã chi ${reportData.totalExpense.toLocaleString('vi-VN')}đ. Xem chi tiết trong email nhé!`,
          url: '/finance'
        });

        this.logger.log(`Sent monthly finance report to ${user.name} (${user.email})`);
      } catch (error) {
        this.logger.error(`Failed to send finance report to user ${user.id}`, error);
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

    const lunarNow = getLunarDateObject(now);
    const isMungMot = lunarNow.day === 1;
    const isRam = lunarNow.day === 15;
    const lunarSpecialMsg = isMungMot ? "Hôm nay là Mùng 1 Âm lịch. Chúc gia đình tháng mới an lành!" : isRam ? "Hôm nay là ngày Rằm Âm lịch (15/12). Chúc gia đình vạn sự hanh thông!" : "";

    // Track users who already received private event emails to avoid duplicates
    const privateEmailsSent = new Map<string, any[]>();

    for (const family of families) {
      const familyEmails = family.users
        .map((u) => u.email)
        .filter((e) => e && this.isValidEmail(e));

      // 1. Send FAMILY/GLOBAL events to all family members
      const allEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear);
      const todayFamilyEvents = allEvents.filter(
        (e) => new Date(e.date).getDate() === currentDay && e.scope !== 'PRIVATE',
      );

      if ((todayFamilyEvents.length > 0 || isMungMot || isRam) && familyEmails.length > 0) {
        const html = this.buildDailyEmailHtml(family.name, todayFamilyEvents, lunarSpecialMsg);
        await this.mailService.sendMail(
          familyEmails,
          isMungMot ? `[Family Calendar] Chúc mừng Mùng 1 tháng mới - ${currentDay}/${currentMonth}` : 
          isRam ? `[Family Calendar] Nhắc nhở ngày Rằm - ${currentDay}/${currentMonth}` :
          `[Family Calendar] Nhắc nhở sự kiện hôm nay - ${currentDay}/${currentMonth}`,
          html,
        );

        // Push to family members
        for (const user of family.users) {
          const pushTitle = isMungMot ? `🌙 Mùng 1 Âm lịch` : isRam ? `🌕 Nhắc nhở ngày Rằm` : `🔔 Nhắc nhở sự kiện hôm nay`;
          const pushBody = lunarSpecialMsg || `Gia đình bạn có ${todayFamilyEvents.length} sự kiện diễn ra vào hôm nay.`;
          
          await this.webPushService.sendToUser(user.id, {
            title: pushTitle,
            body: pushBody,
            url: '/calendar'
          });
        }
      }

      // 2. Send PRIVATE events only to their creators
      for (const user of family.users) {
        if (!user.email || !this.isValidEmail(user.email)) continue;

        const userEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear, user.id);
        const todayPrivateEvents = userEvents.filter(
          (e) => new Date(e.date).getDate() === currentDay && e.scope === 'PRIVATE',
        );

        if (todayPrivateEvents.length > 0) {
          // Accumulate private events across families for the same user
          const existing = privateEmailsSent.get(user.id) || [];
          privateEmailsSent.set(user.id, [...existing, ...todayPrivateEvents.map(e => ({ ...e, userEmail: user.email }))]);
        }
      }
    }

    // Send one consolidated private event email per user
    for (const [userId, events] of privateEmailsSent) {
      const email = events[0].userEmail;
      const html = this.buildDailyEmailHtml('Cá nhân', events);
      await this.mailService.sendMail(
        [email],
        `[Family Calendar] Nhắc nhở sự kiện cá nhân hôm nay - ${currentDay}/${currentMonth}`,
        html,
      );

      // Send Push notification
      await this.webPushService.sendToUser(userId, {
        title: `🔔 Nhắc nhở cá nhân hôm nay`,
        body: `Bạn có ${events.length} sự kiện cá nhân diễn ra vào hôm nay.`,
        url: '/calendar'
      });

      this.logger.log(`Sent private event reminder to user ${userId}`);
    }
  }

  private isValidEmail(email: string): boolean {
    const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return rx.test(email);
  }

  private getEventCategoryInfo(type: string) {
    switch (type) {
      case 'BIRTHDAY':
        return { emoji: '🎂', title: 'Sinh nhật', color: '#e11d48', bgColor: '#fff1f2' };
      case 'HOLIDAY':
        return { emoji: '🎊', title: 'Ngày lễ & Kỷ niệm', color: '#d97706', bgColor: '#fffbeb' };
      case 'ANNIVERSARY':
        return { emoji: '💍', title: 'Kỷ niệm', color: '#7c3aed', bgColor: '#f5f3ff' };
      case 'TASK':
        return { emoji: '✅', title: 'Công việc', color: '#059669', bgColor: '#ecfdf5' };
      case 'APPOINTMENT':
        return { emoji: '⏰', title: 'Lịch hẹn', color: '#2563eb', bgColor: '#eff6ff' };
      default:
        return { emoji: '📅', title: 'Sự kiện khác', color: '#4b5563', bgColor: '#f3f4f6' };
    }
  }

  private buildMonthlyEmailHtml(familyName: string, month: number, events: any[]): string {
    // Group events by category
    const categories: Record<string, any[]> = {};
    events.forEach(e => {
      const info = this.getEventCategoryInfo(e.type);
      if (!categories[info.title]) categories[info.title] = [];
      categories[info.title].push(e);
    });

    const sections = Object.entries(categories).map(([title, catEvents]) => {
      const info = this.getEventCategoryInfo(catEvents[0].type);
      const list = catEvents.map(e => {
        const dateStr = `${new Date(e.date).getDate()}/${month}`;
        let desc = e.description ? `(<em>${e.description}</em>)` : '';
        return `<li style="margin-bottom: 8px;"><strong>${dateStr}:</strong> ${e.title} ${desc}</li>`;
      }).join('');

      return `
        <div style="margin-bottom: 25px;">
          <h3 style="color: ${info.color}; border-bottom: 2px solid ${info.bgColor}; padding-bottom: 5px;">${info.emoji} ${title}</h3>
          <ul style="line-height: 1.6; list-style-type: none; padding-left: 0;">${list}</ul>
        </div>
      `;
    }).join('');

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5; text-align: center;">Tháng ${month} của gia đình ${familyName}</h2>
        <p>Gia đình chúng ta có <strong>${events.length} sự kiện</strong> sắp diễn ra trong tháng này:</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        ${sections}
        <br/>
        <p style="text-align: center; font-weight: bold;">Chúc gia đình một tháng mới tràn đầy niềm vui!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="text-align: center; color: #999; font-size: 12px;">Tin nhắn tự động từ Family Calendar</p>
      </div>
    `;
  }

  private buildDailyEmailHtml(familyName: string, events: any[], specialMsg?: string): string {
    const specialHeader = specialMsg ? `
      <div style="margin-bottom: 25px; padding: 15px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; color: #92400e; text-align: center;">
        <span style="font-size: 1.2em;">🌟</span> <strong style="font-size: 1.1em;">${specialMsg}</strong>
      </div>
    ` : '';

    // Group events by category
    const categories: Record<string, any[]> = {};
    events.forEach(e => {
      const info = this.getEventCategoryInfo(e.type);
      if (!categories[info.title]) categories[info.title] = [];
      categories[info.title].push(e);
    });

    const sections = Object.entries(categories).map(([title, catEvents]) => {
      const info = this.getEventCategoryInfo(catEvents[0].type);
      const items = catEvents.map(e => {
        let desc = e.description ? `<br/><span style="color: #666; font-size: 0.9em;">- ${e.description}</span>` : '';
        return `
          <div style="margin-bottom: 12px; padding: 12px; background: ${info.bgColor}; border-left: 4px solid ${info.color}; border-radius: 4px;">
            <strong style="color: #111827;">${e.title}</strong>
            ${desc}
          </div>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 20px;">
          <h3 style="color: ${info.color}; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
            ${info.emoji} ${title}
          </h3>
          ${items}
        </div>
      `;
    }).join('');

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981; text-align: center;">Chào ngày mới, gia đình ${familyName}!</h2>
        ${specialHeader}
        ${events.length > 0 ? `<p style="text-align: center;">Đừng quên hôm nay chúng ta có các sự kiện quan trọng sau:</p>` : ''}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        ${sections}
        <br/>
        <p style="text-align: center; font-weight: bold;">Chúc đại gia đình một ngày tuyệt vời!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="text-align: center; color: #999; font-size: 12px;">Tin nhắn tự động từ Family Calendar</p>
      </div>
    `;
  }
}
