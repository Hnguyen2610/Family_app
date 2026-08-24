import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';
import { WebPushService } from './web-push.service';
import { HoroscopeService } from '../ai-agent/services/horoscope.service';
import { FinanceService } from '../finance/services/finance.service';
import { getLunarDateObject } from '../../utils/lunar-calendar.util';
import { getIctNow } from '../../utils/timezone.util';
import { TelegramService } from '../telegram/telegram.service';
import { buildDailyEmailHtml, buildMonthlyEmailHtml, getDailyReminderEventContext } from './notification-email-formatters';
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
import { DailyReminderAiContentService } from './daily-reminder-ai-content.service';

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
    private readonly dailyReminderAiContentService: DailyReminderAiContentService,
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

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
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

      for (const user of users) {
        try {
          // 1. Generate Horoscope using AI (Gemini)
          const horoscope = await this.horoscopeService.generateWeeklyHoroscope(user.name, user.birthday || undefined);

          // 2. Send Email
          await this.mailService.sendHoroscopeEmail(user.email, user.name, horoscope);

          // 3. Send Push Notification (Skip short Telegram message)
          await this.createNotification(user.id, {
            type: 'HOROSCOPE',
            title: '🔮 Tử vi tuần mới',
            message: 'Bản tin tử vi tuần mới đã sẵn sàng. Chúc bạn một tuần mới tốt lành!',
            metadata: { fullContent: horoscope }
          }, { skipTelegram: true });

          // 4. Send full horoscope text message directly over Telegram
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
    const now = getIctNow();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    const families = await this.prisma.family.findMany({
      include: { users: true },
    });

    this.logger.log(`Found ${families.length} families to process for monthly summary.`);

    for (const family of families) {
      try {
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
      } catch (error) {
        this.logger.error(`Failed to send monthly summary for family ${family.id} (${family.name})`, error);
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
    const now = getIctNow();
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
    const now = getIctNow();
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

    const familyNameById = new Map(families.map((family) => [family.id, family.name]));
    const remindersByUser = new Map<string, {
      user: any;
      familyNames: Set<string>;
      eventsByKey: Map<string, any>;
      hasLunarSpecial: boolean;
    }>();

    const getReminder = (user: any) => {
      let reminder = remindersByUser.get(user.id);
      if (!reminder) {
        reminder = {
          user,
          familyNames: new Set<string>(),
          eventsByKey: new Map<string, any>(),
          hasLunarSpecial: false,
        };
        remindersByUser.set(user.id, reminder);
      }
      return reminder;
    };

    const addEventForUser = (user: any, familyName: string, event: any, source: string) => {
      const reminder = getReminder(user);
      reminder.familyNames.add(familyName);

      const dateKey = event.date ? new Date(event.date).toISOString().slice(0, 10) : '';
      const key = `${event.id || event.title}:${dateKey}:${event.scope || event.type || ''}`;
      if (!reminder.eventsByKey.has(key)) {
        reminder.eventsByKey.set(key, {
          ...event,
          dailyReminderSource: source,
        });
      }
    };

    for (const family of families) {
      // 1. Send FAMILY/GLOBAL events to all family members
      const allEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear);
      const todayFamilyEvents = allEvents.filter(
        (e) => new Date(e.date).getDate() === currentDay && e.scope !== 'PRIVATE',
      );

      if (todayFamilyEvents.length > 0 || isMungMot || isRam) {
        for (const user of family.users) {
          const reminder = getReminder(user);
          reminder.familyNames.add(family.name);
          reminder.hasLunarSpecial = reminder.hasLunarSpecial || isMungMot || isRam;

          for (const event of todayFamilyEvents) {
            const source = event.type === 'HOLIDAY'
              ? 'Lịch hệ thống'
              : event.scope === 'GLOBAL'
                ? 'Toàn hệ thống'
                : `Gia đình ${family.name}`;
            addEventForUser(user, family.name, event, source);
          }
        }
      }

      // 2. Send PRIVATE events only to their creators
      for (const user of family.users) {
        const userEvents = await this.eventsService.findAll(family.id, currentMonth, currentYear, user.id);
        const todayPrivateEvents = userEvents.filter(
          (e) => new Date(e.date).getDate() === currentDay && e.scope === 'PRIVATE',
        );

        if (todayPrivateEvents.length > 0) {
          for (const event of todayPrivateEvents) {
            const sourceFamilyName = familyNameById.get(event.familyId) || family.name;
            addEventForUser(
              user,
              sourceFamilyName,
              { ...event, userEmail: user.email },
              `Cá nhân · Gia đình ${sourceFamilyName}`,
            );
          }
        }
      }
    }

    // Send one consolidated reminder per user across all families.
    for (const [userId, reminder] of remindersByUser) {
      const events = [...reminder.eventsByKey.values()];
      if (events.length === 0 && !reminder.hasLunarSpecial) continue;

      const familyNames = [...reminder.familyNames];
      const audienceName = familyNames.length === 1
        ? familyNames[0]
        : `${reminder.user.name || 'bạn'} · ${familyNames.join(', ')}`;
      const enrichedEvents = await this.dailyReminderAiContentService.enrichEvents(
        events,
        now,
        audienceName,
      );
      const reminderTitle = isMungMot ? `[Family Calendar] Chúc mừng Mùng 1 tháng mới - ${currentDay}/${currentMonth}` :
        isRam ? `[Family Calendar] Nhắc nhở ngày Rằm - ${currentDay}/${currentMonth}` :
        `[Family Calendar] Nhắc nhở sự kiện hôm nay - ${currentDay}/${currentMonth}`;
      const specialMsg = reminder.hasLunarSpecial ? lunarSpecialMsg : '';
      const html = buildDailyEmailHtml(audienceName, enrichedEvents, specialMsg);

      if (reminder.user.email && isValidEmail(reminder.user.email)) {
        await this.mailService.sendMail([reminder.user.email], reminderTitle, html);
      }

      await this.webPushService.sendToUser(userId, {
        title: isMungMot ? `🔮 Mùng 1 Âm lịch` : isRam ? `🔮 Nhắc nhở ngày Rằm` : `🔮 Nhắc nhở sự kiện hôm nay`,
        body: this.buildDailyPushBody(enrichedEvents, specialMsg),
        url: '/calendar'
      });
      await this.telegramService.sendMessageToUser(
        userId,
        this.buildDailyTelegramMessage(
          audienceName,
          reminderTitle.replace('[Family Calendar] ', ''),
          enrichedEvents,
          specialMsg,
        ),
      );

      this.logger.log(`Sent daily reminder to user ${userId}`);
    }
  }

  private buildDailyTelegramMessage(
    familyName: string,
    title: string,
    events: any[],
    specialMsg?: string,
  ) {
    const audienceLine = familyName === 'Cá nhân'
      ? 'Lịch Cá nhân'
      : familyName.includes(' · ')
        ? `Tổng hợp: ${this.escapeTelegramHtml(familyName)}`
      : `Gia đình ${this.escapeTelegramHtml(familyName)}`;
    const lines = [
      `<b>${this.escapeTelegramHtml(title)}</b>`,
      audienceLine,
    ];

    if (specialMsg) {
      lines.push('', this.escapeTelegramHtml(specialMsg));
    }

    if (events.length > 0) {
      lines.push('', 'Các sự kiện hôm nay:');
      for (const event of events) {
        const context = getDailyReminderEventContext(event);
        const explanationLabel = event.type === 'HOLIDAY' ? 'Vì sao' : 'Vì sao nhắc';
        lines.push(`• ${this.escapeTelegramHtml(event.title)}`);
        if (event.dailyReminderSource) {
          lines.push(`  Nguồn: ${this.escapeTelegramHtml(event.dailyReminderSource)}`);
        }
        if (context.explanation) {
          lines.push(`  ${explanationLabel}: ${this.escapeTelegramHtml(context.explanation)}`);
        }
        if (context.advice) {
          lines.push(`  Lời nhắn: ${this.escapeTelegramHtml(context.advice)}`);
        }
      }
    }

    return lines.join('\n');
  }

  private buildDailyPushBody(events: any[], specialMsg?: string) {
    if (events.length === 1) {
      const event = events[0];
      const context = getDailyReminderEventContext(event);
      const note = context.advice || context.explanation;
      return note ? `${event.title}: ${note}` : `Hôm nay có sự kiện: ${event.title}.`;
    }
    if (specialMsg) return specialMsg;
    return `Gia đình bạn có ${events.length} sự kiện diễn ra vào hôm nay.`;
  }

  private escapeTelegramHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

}
