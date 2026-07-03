import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';
import { WebPushService } from './web-push.service';
import { AiAgentService } from '../ai-agent/services/ai-agent.service';
import { FinanceService } from '../finance/services/finance.service';
import { getLunarDateObject } from '../../utils/lunar-calendar.util';
import { formatIctDate, getIctDateKey, getIctNow, startOfIctDay } from '../../utils/timezone.util';
import { TelegramService } from '../telegram/telegram.service';
import { WeatherForecastSummary, WeatherService } from '../weather/weather.service';
import { buildDailyEmailHtml, buildMonthlyEmailHtml } from './notification-email-formatters';
import {
  cleanHtmlForTelegram,
  isValidEmail,
  type CreateNotificationOptions,
  type NotificationPayload,
  type ProactiveAssistantSummary,
  type ProactiveBriefingItem,
  type ProactiveRunOptions,
} from './notification-types';
import {
  getProactiveDeliveryOptions,
  isProactiveTypeEnabled,
  shouldRunProactiveAtConfiguredHour,
} from './proactive-notification-settings';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly proactiveLookaheadDays = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly webPushService: WebPushService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
    private readonly aiAgentService: AiAgentService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
    private readonly telegramService: TelegramService,
    private readonly weatherService: WeatherService,
  ) {}

  // --- In-App Notifications ---

  async createNotification(
    userId: string,
    data: NotificationPayload,
    options: CreateNotificationOptions | boolean = {},
  ) {
    try {
      const skipTelegram = typeof options === 'boolean' ? options : options.skipTelegram === true;
      const skipWebPush = typeof options === 'boolean' ? false : options.skipWebPush === true;
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
      if (!skipWebPush) {
        await this.webPushService.sendToUser(userId, {
          title: data.title,
          body: data.message,
          url: data.metadata?.path || '/'
        });
      }

      // Send Telegram
      if (!skipTelegram) {
        await this.telegramService.sendMessageToUser(userId, `<b>${data.title}</b>\n${data.message}`);
      }

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
          const horoscope = await this.aiAgentService.generateHoroscope(user.name, user.birthday || undefined, context);
          
          // 3. Send Email
          await this.mailService.sendHoroscopeEmail(user.email, user.name, horoscope);

          // 4. Send Push Notification (Skip short Telegram message)
          await this.createNotification(user.id, {
            type: 'HOROSCOPE',
            title: '🔮 Tử vi tuần mới',
            message: 'Bản tin tử vi tuần mới đã được cá nhân hóa dựa trên lịch trình của bạn. Chúc bạn một tuần mới tốt lành!',
            metadata: { path: '/settings' }
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
    const summary: ProactiveAssistantSummary = {
      usersScanned: 0,
      dailyBriefings: 0,
      eventSuggestions: 0,
      financeSuggestions: 0,
      weatherSuggestions: 0,
      familyNoteSuggestions: 0,
      skippedDuplicates: 0,
      errors: 0,
    };

    const now = getIctNow();
    this.logger.log('Starting proactive assistant cron job...');
    const weatherForecast = await this.weatherService.getTomorrowForecast();

    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        notificationSettings: true,
        familyId: true,
        family: { select: { id: true, name: true } },
        families: { select: { id: true, name: true } },
      },
    });

    for (const user of users) {
      summary.usersScanned += 1;

      try {
        const settings = (user.notificationSettings || {}) as Record<string, any>;
        if (settings.proactiveAssistant === false) continue;
        if (options.respectUserTime && !shouldRunProactiveAtConfiguredHour(settings, now)) continue;

        const briefingResult = await this.sendDailyBriefing(user, now, weatherForecast);
        summary.dailyBriefings += briefingResult.sent;
        summary.eventSuggestions += briefingResult.eventItems;
        summary.financeSuggestions += briefingResult.financeItems;
        summary.weatherSuggestions += briefingResult.weatherItems;
        summary.familyNoteSuggestions += briefingResult.familyNoteItems;
        summary.skippedDuplicates += briefingResult.skippedDuplicates;
      } catch (error) {
        summary.errors += 1;
        this.logger.error(`Failed proactive assistant for user ${user.id}`, error);
      }
    }

    this.logger.log(`Proactive assistant finished: ${JSON.stringify(summary)}`);
    return summary;
  }

  private async sendDailyBriefing(user: any, now: Date, weatherForecast: WeatherForecastSummary | null) {
    const result = {
      sent: 0,
      skippedDuplicates: 0,
      eventItems: 0,
      financeItems: 0,
      weatherItems: 0,
      familyNoteItems: 0,
    };
    const settings = (user.notificationSettings || {}) as Record<string, any>;
    const items: ProactiveBriefingItem[] = [];

    if (isProactiveTypeEnabled(settings, 'eventChecklist')) {
      const eventItems = await this.buildEventBriefingItems(user.id, now);
      items.push(...eventItems);
      result.eventItems = eventItems.length;
    }

    if (isProactiveTypeEnabled(settings, 'weather')) {
      const weatherItem = this.buildWeatherBriefingItem(weatherForecast);
      if (weatherItem) {
        items.push(weatherItem);
        result.weatherItems = 1;
      }
    }

    if (isProactiveTypeEnabled(settings, 'finance')) {
      const financeItem = await this.buildFinanceBriefingItem(user.id, now);
      if (financeItem) {
        items.push(financeItem);
        result.financeItems = 1;
      }
    }

    const includeFamilyNotes = isProactiveTypeEnabled(settings, 'familyNotes');
    const includeMedicineSchool = isProactiveTypeEnabled(settings, 'medicineSchool');
    if (includeFamilyNotes || includeMedicineSchool) {
      const noteItems = await this.buildFamilyNoteBriefingItems(user, includeFamilyNotes, includeMedicineSchool);
      items.push(...noteItems);
      result.familyNoteItems = noteItems.length;
    }

    if (items.length === 0) return result;

    const dateKey = getIctDateKey(now);
    const title = `Tóm tắt gia đình ${formatIctDate(now)}`;
    const message = this.formatDailyBriefingMessage(items);
    const created = await this.createProactiveNotification(user.id, {
      type: 'PROACTIVE_DAILY_BRIEFING',
      title,
      message,
      metadata: {
        path: items[0]?.path || '/',
        source: 'proactive-assistant',
        proactiveReason: 'daily_briefing',
        dateKey,
        itemCount: items.length,
        reasons: items.map((item) => item.reason),
        items: items.map((item) => ({
          kind: item.kind,
          title: item.title,
          path: item.path,
          reason: item.reason,
          metadata: item.metadata || {},
        })),
      },
    }, 1, getProactiveDeliveryOptions(settings));

    if (created) result.sent = 1;
    else result.skippedDuplicates = 1;
    return result;
  }

  private async buildEventBriefingItems(userId: string, now: Date): Promise<ProactiveBriefingItem[]> {
    const upcomingEvents = await this.getUpcomingEventsForUser(userId, now, this.proactiveLookaheadDays);
    return upcomingEvents
      .filter((event) => event.type !== 'HOLIDAY')
      .filter((event) => {
        const daysUntil = this.getDaysUntil(now, new Date(event.date));
        return daysUntil >= 1 && daysUntil <= this.proactiveLookaheadDays;
      })
      .slice(0, 3)
      .map((event) => {
        const eventDate = new Date(event.date);
        const daysUntil = this.getDaysUntil(now, eventDate);
        const type = String(event.type || 'GENERAL');
        const reason = type === 'BIRTHDAY'
          ? 'birthday_soon'
          : type === 'ANNIVERSARY'
            ? 'anniversary_soon'
            : 'event_soon';
        return {
          kind: 'event' as const,
          title: event.title,
          message: `Còn ${daysUntil} ngày nữa: ${event.title} (${formatIctDate(eventDate)}).`,
          path: '/calendar',
          reason,
          metadata: {
            eventId: event.id,
            eventType: type,
            eventDate: eventDate.toISOString(),
            daysUntil,
          },
        };
      });
  }

  private buildWeatherBriefingItem(forecast: WeatherForecastSummary | null): ProactiveBriefingItem | null {
    if (!forecast) return null;

    const shouldNotify =
      forecast.chanceOfRain >= 50 ||
      forecast.totalPrecipMm >= 2 ||
      /rain|mưa|drizzle|shower|storm|thunder/i.test(forecast.condition);

    if (!shouldNotify) return null;

    return {
      kind: 'weather',
      title: `Thời tiết ${forecast.location}`,
      message: `Ngày mai ${forecast.condition.toLowerCase()}, khả năng mưa ${forecast.chanceOfRain}%, ${Math.round(forecast.minTempC)}-${Math.round(forecast.maxTempC)}°C.`,
      path: '/calendar',
      reason: 'rain_or_bad_weather_tomorrow',
      metadata: {
        provider: process.env.WEATHER_PROVIDER || 'weatherapi',
        location: forecast.location,
        forecastDate: forecast.date,
        chanceOfRain: forecast.chanceOfRain,
        totalPrecipMm: forecast.totalPrecipMm,
      },
    };
  }

  private async buildFinanceBriefingItem(userId: string, now: Date): Promise<ProactiveBriefingItem | null> {
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const previous = this.getPreviousMonth(currentMonth, currentYear);

    const [currentReport, previousReport] = await Promise.all([
      this.financeService.getMonthlyReportData(userId, currentMonth, currentYear),
      this.financeService.getMonthlyReportData(userId, previous.month, previous.year),
    ]);

    const currentFood = this.getCategoryAmount(currentReport, 'FOOD');
    const previousFood = this.getCategoryAmount(previousReport, 'FOOD');
    const minimumComparableAmount = 100000;
    if (previousFood < minimumComparableAmount || currentFood < previousFood * 1.2) return null;

    const increasePercent = Math.round(((currentFood - previousFood) / previousFood) * 100);
    return {
      kind: 'finance',
      title: `Chi tiêu ăn uống tăng ${increasePercent}%`,
      message: `FOOD tháng này ${currentFood.toLocaleString('vi-VN')}đ, cao hơn tháng trước ${increasePercent}%.`,
      path: '/finance',
      reason: 'food_spending_increased',
      metadata: {
        category: 'FOOD',
        currentAmount: currentFood,
        previousAmount: previousFood,
        increasePercent,
      },
    };
  }

  private async buildFamilyNoteBriefingItems(
    user: any,
    includeGeneralNotes: boolean,
    includeMedicineSchoolNotes: boolean,
  ): Promise<ProactiveBriefingItem[]> {
    const familyIds = this.getUserFamilyIds(user);
    if (familyIds.length === 0) return [];

    const since = getIctNow();
    since.setDate(since.getDate() - 7);

    const documents = await this.prisma.aiDocument.findMany({
      where: {
        familyId: { in: familyIds },
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        sourceType: true,
        familyId: true,
        metadata: true,
        updatedAt: true,
      },
    });

    return documents
      .map((document) => ({
        document,
        reason: this.getFamilyNoteReason(document.metadata),
      }))
      .filter(({ reason }) => {
        const isMedicineSchool =
          reason === 'medicine_or_health_note_updated' ||
          reason === 'school_note_updated';
        return isMedicineSchool ? includeMedicineSchoolNotes : includeGeneralNotes;
      })
      .map(({ document, reason }) => ({
        kind: 'family_note' as const,
        title: document.title,
        message: `Sổ tay vừa cập nhật: ${document.title}.`,
        path: '/notes',
        reason,
        metadata: {
          documentId: document.id,
          familyId: document.familyId,
          sourceType: document.sourceType,
          updatedAt: document.updatedAt.toISOString(),
        },
      }));
  }

  private formatDailyBriefingMessage(items: ProactiveBriefingItem[]) {
    const lines = ['Hôm nay có vài điểm đáng chú ý:'];
    const labels: Record<ProactiveBriefingItem['kind'], string> = {
      event: 'Lịch',
      weather: 'Thời tiết',
      finance: 'Chi tiêu',
      family_note: 'Sổ tay',
    };

    for (const item of items) {
      lines.push(`- ${labels[item.kind]}: ${item.message}`);
    }

    return lines.join('\n');
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

  private async sendUpcomingEventSuggestions(user: any, now: Date) {
    const result = { sent: 0, skippedDuplicates: 0 };
    const settings = (user.notificationSettings || {}) as Record<string, any>;
    if (settings.proactiveAssistant === false) return result;

    const upcomingEvents = await this.getUpcomingEventsForUser(user.id, now, this.proactiveLookaheadDays);
    const actionableEvents = upcomingEvents
      .filter((event) => event.type !== 'HOLIDAY')
      .filter((event) => {
        const daysUntil = this.getDaysUntil(now, new Date(event.date));
        return daysUntil >= 1 && daysUntil <= this.proactiveLookaheadDays;
      })
      .slice(0, 3);

    for (const event of actionableEvents) {
      const eventDate = new Date(event.date);
      const daysUntil = this.getDaysUntil(now, eventDate);
      const isBirthday = event.type === 'BIRTHDAY';
      const isAnniversary = event.type === 'ANNIVERSARY';
      const eventLabel = isBirthday ? 'sinh nhật' : isAnniversary ? 'kỷ niệm' : 'sự kiện';
      const dateLabel = formatIctDate(eventDate);
      const title = `Sắp có ${eventLabel}: ${event.title}`;
      const message = `Còn ${daysUntil} ngày nữa là ${event.title} (${dateLabel}). Bạn có muốn FamilyGPT gợi ý checklist, quà tặng hoặc việc cần chuẩn bị không?`;

      const created = await this.createProactiveNotification(user.id, {
        type: 'PROACTIVE_EVENT',
        title,
        message,
        metadata: {
          path: '/calendar',
          eventId: event.id,
          eventDate: eventDate.toISOString(),
          daysUntil,
          source: 'proactive-assistant',
          proactiveReason: isBirthday ? 'birthday_soon' : isAnniversary ? 'anniversary_soon' : 'event_soon',
        },
      }, 14, getProactiveDeliveryOptions(settings));

      if (created) result.sent += 1;
      else result.skippedDuplicates += 1;
    }

    return result;
  }

  private async sendWeatherSuggestion(user: any, forecast: WeatherForecastSummary | null) {
    const result = { sent: 0, skippedDuplicates: 0 };
    if (!forecast) return result;

    const settings = (user.notificationSettings || {}) as Record<string, any>;
    if (settings.proactiveAssistant === false) return result;

    const shouldNotify =
      forecast.chanceOfRain >= 50 ||
      forecast.totalPrecipMm >= 2 ||
      /rain|mưa|drizzle|shower|storm|thunder/i.test(forecast.condition);

    if (!shouldNotify) return result;

    const title = `Dự báo thời tiết ${forecast.location}`;
    const message = [
      `Ngày mai (${forecast.date}) có ${forecast.condition.toLowerCase()}, khả năng mưa ${forecast.chanceOfRain}%.`,
      `Nhiệt độ khoảng ${Math.round(forecast.minTempC)}-${Math.round(forecast.maxTempC)}°C.`,
      'Cả nhà nhớ chuẩn bị áo mưa/ô và kiểm tra đồ phơi nếu cần nhé.',
    ].join(' ');

    const created = await this.createProactiveNotification(user.id, {
      type: 'PROACTIVE_WEATHER',
      title,
      message,
      metadata: {
        path: '/calendar',
        source: 'proactive-assistant',
        proactiveReason: 'rain_or_bad_weather_tomorrow',
        provider: process.env.WEATHER_PROVIDER || 'weatherapi',
        location: forecast.location,
        forecastDate: forecast.date,
        chanceOfRain: forecast.chanceOfRain,
        totalPrecipMm: forecast.totalPrecipMm,
      },
    }, 1, getProactiveDeliveryOptions(settings));

    if (created) result.sent += 1;
    else result.skippedDuplicates += 1;

    return result;
  }

  private async sendFinanceSpendingInsight(userId: string, now: Date) {
    const result = { sent: 0, skippedDuplicates: 0 };
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const previous = this.getPreviousMonth(currentMonth, currentYear);

    const [currentReport, previousReport] = await Promise.all([
      this.financeService.getMonthlyReportData(userId, currentMonth, currentYear),
      this.financeService.getMonthlyReportData(userId, previous.month, previous.year),
    ]);

    const currentFood = this.getCategoryAmount(currentReport, 'FOOD');
    const previousFood = this.getCategoryAmount(previousReport, 'FOOD');
    const minimumComparableAmount = 100000;

    if (previousFood < minimumComparableAmount || currentFood < previousFood * 1.2) {
      return result;
    }

    const increasePercent = Math.round(((currentFood - previousFood) / previousFood) * 100);
    const title = `Chi tiêu ăn uống tháng ${currentMonth} tăng`;
    const message = `Chi tiêu FOOD tháng này đang cao hơn tháng trước ${increasePercent}%. Hiện tại: ${currentFood.toLocaleString('vi-VN')}d, tháng trước: ${previousFood.toLocaleString('vi-VN')}d. ạn có muốn xem chi tiết không?`;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });
    const settings = (user?.notificationSettings || {}) as Record<string, any>;

    const created = await this.createProactiveNotification(userId, {
      type: 'PROACTIVE_FINANCE',
      title,
      message,
      metadata: {
        path: '/finance',
        category: 'FOOD',
        currentAmount: currentFood,
        previousAmount: previousFood,
        increasePercent,
        source: 'proactive-assistant',
        proactiveReason: 'food_spending_increased',
      },
    }, 30, getProactiveDeliveryOptions(settings));

    if (created) result.sent += 1;
    else result.skippedDuplicates += 1;

    return result;
  }

  private async getUpcomingEventsForUser(userId: string, now: Date, lookaheadDays: number) {
    const start = startOfIctDay(now);
    const end = startOfIctDay(now);
    end.setDate(end.getDate() + lookaheadDays);

    const currentMonth = start.getMonth() + 1;
    const currentYear = start.getFullYear();
    const endMonth = end.getMonth() + 1;
    const endYear = end.getFullYear();

    const currentEvents = await this.eventsService.findAll('all', currentMonth, currentYear, userId);
    let allEvents = [...currentEvents];

    if (currentMonth !== endMonth || currentYear !== endYear) {
      const nextEvents = await this.eventsService.findAll('all', endMonth, endYear, userId);
      allEvents = [...allEvents, ...nextEvents];
    }

    const seen = new Set<string>();
    return allEvents
      .filter((event) => {
        const eventDate = startOfIctDay(new Date(event.date));
        return eventDate > start && eventDate <= end;
      })
      .filter((event) => {
        const key = `${event.id}:${new Date(event.date).toISOString()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private async createProactiveNotification(
    userId: string,
    data: NotificationPayload,
    dedupeDays: number,
    options: CreateNotificationOptions = {},
  ) {
    const since = getIctNow();
    since.setDate(since.getDate() - dedupeDays);

    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: data.type,
        title: data.title,
        createdAt: { gte: since },
      },
      select: { id: true },
    });

    if (existing) return false;

    await this.createNotification(userId, data, options);
    return true;
  }

  private getUserFamilyIds(user: any) {
    const ids = new Set<string>();
    if (user?.familyId) ids.add(user.familyId);
    if (user?.family?.id) ids.add(user.family.id);
    for (const family of user?.families || []) {
      if (family?.id) ids.add(family.id);
    }
    return [...ids];
  }

  private getFamilyNoteReason(metadata: any) {
    const category = String(metadata?.category || metadata?.type || '').toLowerCase();
    if (['medicine', 'health', 'suc_khoe', 'suc khoe'].some((item) => category.includes(item))) return 'medicine_or_health_note_updated';
    if (['school', 'hoc_tap', 'hoc tap'].some((item) => category.includes(item))) return 'school_note_updated';
    return 'family_note_updated';
  }

  private getCategoryAmount(report: { categories?: Array<{ category: string; amount: number }> }, category: string) {
    return report.categories?.find((item) => item.category === category)?.amount || 0;
  }

  private getPreviousMonth(month: number, year: number) {
    if (month === 1) return { month: 12, year: year - 1 };
    return { month: month - 1, year };
  }

  private getDaysUntil(from: Date, to: Date) {
    const fromDay = startOfIctDay(from).getTime();
    const toDay = startOfIctDay(to).getTime();
    return Math.round((toDay - fromDay) / (24 * 60 * 60 * 1000));
  }

}
