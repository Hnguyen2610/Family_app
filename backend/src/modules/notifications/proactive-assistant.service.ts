import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatIctDate, getIctDateKey, getIctNow } from '../../utils/timezone.util';
import { WeatherService } from '../weather/weather.service';
import { hasRecentNotification } from './notification-dedupe.helper';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationPayload, ProactiveAssistantSummary, ProactiveRunOptions } from './notification-types';
import { ProactiveBriefingBuilder } from './proactive-briefing.builder';
import {
  getDailyBriefingSignatureLine,
  getProactiveDeliveryOptions,
  shouldRunProactiveAtConfiguredHour,
} from './proactive-notification-settings';

@Injectable()
export class ProactiveAssistantService {
  private readonly logger = new Logger(ProactiveAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weatherService: WeatherService,
    private readonly proactiveBriefingBuilder: ProactiveBriefingBuilder,
    private readonly notificationDeliveryService: NotificationDeliveryService,
  ) {}

  async run(options: ProactiveRunOptions = {}): Promise<ProactiveAssistantSummary> {
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
    const [weatherForecast, tomorrowWeatherForecast] = await Promise.all([
      this.weatherService.getTodayForecast(),
      this.weatherService.getTomorrowForecast(),
    ]);

    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        globalRole: true,
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

        const briefingResult = await this.sendDailyBriefing(user, now, weatherForecast, tomorrowWeatherForecast);
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

  private async sendDailyBriefing(
    user: any,
    now: Date,
    weatherForecast: Awaited<ReturnType<WeatherService['getTodayForecast']>>,
    tomorrowWeatherForecast: Awaited<ReturnType<WeatherService['getTomorrowForecast']>>,
  ) {
    const result = {
      sent: 0,
      skippedDuplicates: 0,
      eventItems: 0,
      financeItems: 0,
      weatherItems: 0,
      familyNoteItems: 0,
    };
    const settings = (user.notificationSettings || {}) as Record<string, any>;
    const briefing = await this.proactiveBriefingBuilder.buildDailyBriefing(user, now, weatherForecast, tomorrowWeatherForecast);

    result.eventItems = briefing.eventItems;
    result.financeItems = briefing.financeItems;
    result.weatherItems = briefing.weatherItems;
    result.familyNoteItems = briefing.familyNoteItems;

    if (briefing.items.length === 0) return result;

    const dateKey = getIctDateKey(now);
    const title = `Tóm tắt gia đình ${formatIctDate(now)}`;
    const message = await this.proactiveBriefingBuilder.formatDailyBriefingMessage(briefing.items);
    const isAdminUser = user.globalRole === 'ADMIN' || user.globalRole === 'SUPER_ADMIN';
    const telegramExtra = isAdminUser ? undefined : (getDailyBriefingSignatureLine(settings, user.name) || undefined);
    const created = await this.createProactiveNotification(user.id, {
      type: 'PROACTIVE_DAILY_BRIEFING',
      title,
      message,
      telegramExtra,
      metadata: {
        path: briefing.items[0]?.path || '/',
        source: 'proactive-assistant',
        proactiveReason: 'daily_briefing',
        dateKey,
        itemCount: briefing.items.length,
        reasons: briefing.items.map((item) => item.reason),
        items: briefing.items.map((item) => ({
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

  private async createProactiveNotification(
    userId: string,
    data: NotificationPayload,
    dedupeDays: number,
    options = {},
  ) {
    if (await hasRecentNotification(this.prisma, userId, data.type, data.title, dedupeDays)) return false;

    await this.notificationDeliveryService.createNotification(userId, data, options);
    return true;
  }
}
