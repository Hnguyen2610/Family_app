import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';
import { WebPushService } from './web-push.service';
import { HoroscopeService } from '../ai-agent/services/horoscope.service';
import { FinanceService } from '../finance/services/finance.service';
import { getLunarDateObject } from '../../utils/lunar-calendar.util';
import { TelegramService } from '../telegram/telegram.service';
import { buildDailyEmailHtml, buildMonthlyEmailHtml } from './notification-email-formatters';
import {
  cleanHtmlForTelegram,
  isValidEmail,
  type CreateNotificationOptions,
  type NotificationPayload,
  type ProactiveAssistantSummary,
  type ProactiveRunOptions,
} from './notification-types';
import { NotificationDeliveryService } from './notification-delivery.service';
import { ProactiveAssistantService } from './proactive-assistant.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly webPushService: WebPushService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
    private readonly horoscopeService: HoroscopeService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
    private readonly telegramService: TelegramService,
    private readonly notificationDeliveryService: NotificationDeliveryService,
    private readonly proactiveAssistantService: ProactiveAssistantService,
  ) {}

  // --- In-App Notifications ---

  async createNotification(
    userId: string,
    data: NotificationPayload,
    options: CreateNotificationOptions | boolean = {},
  ) {
    return this.notificationDeliveryService.createNotification(userId, data, options);
  }

  async getForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId?: string) {
    return this.prisma.notification.updateMany({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId?: string) {
    const where: any = { isRead: false };
    if (userId && userId !== 'undefined') {
      where.userId = userId;
    }
    return this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  async delete(id: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: { id, userId },
    });
  }

  async deleteAll(userId: string) {
    return this.prisma.notification.deleteMany({
      where: { userId },
    });
  }

  // 0. Cron Job: 6:00 AM every Monday - Weekly Horoscope for all users
  @Cron('0 6 * * 1', {
    name: 'weekly-horoscope',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendWeeklyHoroscope() {
    this.logger.log('Starting weekly horoscope cron job...');
    try {
      const users = await this.prisma.user.findMany({
        where: { 
          globalRole: 'SUPER_ADMIN'
        },
      });

      this.logger.log(`Found ${users.length} users with email to process.`);

      const now = new Date();
      // Shift by 7 hours to get ICT time accurately
      const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const nextWeek = new Date(ictNow.getTime() + 7 * 24 * 60 * 60 * 1000);

      for (const user of users) {
        try {
          // 1. Get events for the next 7 days
          // We get events for current month and next month to be safe
          const currentMonth = ictNow.getUTCMonth() + 1;
          const currentYear = ictNow.getUTCFullYear();
          const nextMonth = nextWeek.getUTCMonth() + 1;
          const nextYear = nextWeek.getUTCFullYear();

          const eventsCurrent = await this.eventsService.findAll('all', currentMonth, currentYear, user.id);
          let allUpcomingEvents = [...eventsCurrent];

          if (currentMonth !== nextMonth) {
            const eventsNext = await this.eventsService.findAll('all', nextMonth, nextYear, user.id);
            allUpcomingEvents = [...allUpcomingEvents, ...eventsNext];
          }

          // Filter for the next 7 days
          const weekEvents = allUpcomingEvents.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= ictNow && eventDate <= nextWeek;
          });

          const eventContext = weekEvents.length > 0
            ? weekEvents.map(e => `- Ngày ${new Date(e.date).toLocaleDateString('vi-VN')}: ${e.title}${e.description ? ' (' + e.description + ')' : ''}`).join('\n')
            : 'Không có sự kiện đặc biệt nào được ghi nhận trong lịch trình tuần này.';

          const context = `Lịch trình/Sự kiện của người dùng trong 7 ngày tới:\n${eventContext}\n\nVai trò trong gia đình: ${user.role || 'Thành viên'}.`;

          // 2. Generate Horoscope using AI (Gemini)
          const horoscope = await this.horoscopeService.generateWeeklyHoroscope(user.name, user.birthday || undefined, context);

          // 3. Send Email
          await this.mailService.sendHoroscopeEmail(user.email, user.name, horoscope);

          // 4. Send Push Notification (Skip short Telegram message)
          await this.createNotification(user.id, {
            type: 'HOROSCOPE',
            title: '🔮 Tử vi tuần mới',
            message: 'Bản tin tử vi tuần mới đã được cá nhân hóa dựa trên lịch trình của bạn. Chúc bạn một tuần mới tốt lành!',
            metadata: { fullContent: horoscope }
          }, { skipTelegram: true });

          // 5. Send full horoscope text message directly over Telegram
          const cleanedHoroscope = cleanHtmlForTelegram(horoscope);
          const telegramMsg = `<b>🔮 TỬ VI TUẦN MỚI DÀNH CHO ${user.name.toUpperCase()}</b>\n\n${cleanedHoroscope}`;
          await this.telegramService.sendMessageToUser(user.id, telegramMsg);

          this.logger.log(`Successfully sent personalized weekly horoscope to ${user.name} (${user.email})`);
        } catch (userError) {
          this.logger.error(`Failed to process horoscope for user ${user.id} (${user.name})`, userError);
        }
      }
    } catch (error) {
      this.logger.error('Error in weekly horoscope cron job', error);
    }
    this.logger.log('Weekly horoscope cron job finished.');
  }

  // --- Cron Jobs & Email Notifications ---
  @Cron('0 8 1 * *', {
    name: 'monthly-summary',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendMonthlySummary() {
    this.logger.log('Starting monthly summary cron job...');
    // Use proper ICT local date 
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    const families = await this.prisma.family.findMany({
      include: { users: true },
    });

    this.logger.log(`Found ${families.length} families to process for monthly summary.`);

    for (const family of families) {
      const emails = family.users
        .map((u) => u.email)
        .filter((e) => e && isValidEmail(e));

      if (emails.length === 0) continue;

      // Use eventsService to get actual DB events + Holidays + Birthdays
      const events = await this.eventsService.findAll(family.id, currentMonth, currentYear);

      if (events.length > 0) {
        const html = buildMonthlyEmailHtml(family.name, currentMonth, events);
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
    // Use proper ICT local date
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
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

  // 1.6. Cron Job: hourly proactive assistant scheduler.
  @Cron('0 * * * *', {
    name: 'proactive-assistant',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runScheduledProactiveAssistant(): Promise<ProactiveAssistantSummary> {
    return this.runProactiveAssistant({ respectUserTime: true });
  }

  async runProactiveAssistant(options: ProactiveRunOptions = {}): Promise<ProactiveAssistantSummary> {
    return this.proactiveAssistantService.run(options);
  }
  // 2. Cron Job: 6:00 AM every day
  @Cron('0 6 * * *', {
    name: 'daily-reminder',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendDailyReminder() {
    this.logger.log('Starting daily reminder cron job...');
    // Use proper ICT local date
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
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
        .filter((e) => e && isValidEmail(e));

      // 1. Send FAMILY/GLOBAL events to all family members
      const allEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear);
      const todayFamilyEvents = allEvents.filter(
        (e) => new Date(e.date).getDate() === currentDay && e.scope !== 'PRIVATE',
      );

      if ((todayFamilyEvents.length > 0 || isMungMot || isRam) && familyEmails.length > 0) {
        const html = buildDailyEmailHtml(family.name, todayFamilyEvents, lunarSpecialMsg);
        await this.mailService.sendMail(
          familyEmails,
          isMungMot ? `[Family Calendar] Chúc mừng Mùng 1 tháng mới - ${currentDay}/${currentMonth}` : 
          isRam ? `[Family Calendar] Nhắc nhở ngày Rằm - ${currentDay}/${currentMonth}` :
          `[Family Calendar] Nhắc nhở sự kiện hôm nay - ${currentDay}/${currentMonth}`,
          html,
        );

        // Push to family members
        for (const user of family.users) {
          const pushTitle = isMungMot ? `🔮 Mùng 1 Âm lịch` : isRam ? `🔮 Nhắc nhở ngày Rằm` : `🔮 Nhắc nhở sự kiện hôm nay`;
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
        if (!user.email || !isValidEmail(user.email)) continue;

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
      const html = buildDailyEmailHtml('Cá nhân', events);
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

}
