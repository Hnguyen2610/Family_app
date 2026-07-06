import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { FinanceService } from '../finance/services/finance.service';
import { WeatherForecastSummary } from '../weather/weather.service';
import { formatIctDate, getIctNow, startOfIctDay } from '../../utils/timezone.util';
import { ProactiveBriefingItem } from './notification-types';
import { isProactiveTypeEnabled } from './proactive-notification-settings';

export type DailyBriefingBuildResult = {
  items: ProactiveBriefingItem[];
  eventItems: number;
  financeItems: number;
  weatherItems: number;
  familyNoteItems: number;
};

@Injectable()
export class ProactiveBriefingBuilder {
  private readonly lookaheadDays = 7;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
  ) {}

  async buildDailyBriefing(
    user: any,
    now: Date,
    weatherForecast: WeatherForecastSummary | null,
  ): Promise<DailyBriefingBuildResult> {
    const result: DailyBriefingBuildResult = {
      items: [],
      eventItems: 0,
      financeItems: 0,
      weatherItems: 0,
      familyNoteItems: 0,
    };
    const settings = (user.notificationSettings || {}) as Record<string, any>;

    if (isProactiveTypeEnabled(settings, 'eventChecklist')) {
      const eventItems = await this.buildEventBriefingItems(user.id, now);
      result.items.push(...eventItems);
      result.eventItems = eventItems.length;
    }

    if (isProactiveTypeEnabled(settings, 'weather')) {
      const weatherItem = this.buildWeatherBriefingItem(weatherForecast);
      if (weatherItem) {
        result.items.push(weatherItem);
        result.weatherItems = 1;
      }
    }

    if (isProactiveTypeEnabled(settings, 'finance')) {
      const financeItem = await this.buildFinanceBriefingItem(user.id, now);
      if (financeItem) {
        result.items.push(financeItem);
        result.financeItems = 1;
      }
    }

    const includeFamilyNotes = isProactiveTypeEnabled(settings, 'familyNotes');
    const includeMedicineSchool = isProactiveTypeEnabled(settings, 'medicineSchool');
    if (includeFamilyNotes || includeMedicineSchool) {
      const noteItems = await this.buildFamilyNoteBriefingItems(user, includeFamilyNotes, includeMedicineSchool);
      result.items.push(...noteItems);
      result.familyNoteItems = noteItems.length;
    }

    return result;
  }

  formatDailyBriefingMessage(items: ProactiveBriefingItem[]) {
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

  private async buildEventBriefingItems(userId: string, now: Date): Promise<ProactiveBriefingItem[]> {
    const upcomingEvents = await this.getUpcomingEventsForUser(userId, now, this.lookaheadDays);
    return upcomingEvents
      .filter((event) => event.type !== 'HOLIDAY')
      .filter((event) => {
        const daysUntil = getDaysUntil(now, new Date(event.date));
        return daysUntil >= 1 && daysUntil <= this.lookaheadDays;
      })
      .slice(0, 3)
      .map((event) => {
        const eventDate = new Date(event.date);
        const daysUntil = getDaysUntil(now, eventDate);
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
    const previous = getPreviousMonth(currentMonth, currentYear);

    const [currentReport, previousReport] = await Promise.all([
      this.financeService.getMonthlyReportData(userId, currentMonth, currentYear),
      this.financeService.getMonthlyReportData(userId, previous.month, previous.year),
    ]);

    const currentFood = getCategoryAmount(currentReport, 'FOOD');
    const previousFood = getCategoryAmount(previousReport, 'FOOD');
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
    const familyIds = getUserFamilyIds(user);
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
        reason: getFamilyNoteReason(document.metadata),
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
}

function getUserFamilyIds(user: any) {
  const ids = new Set<string>();
  if (user?.familyId) ids.add(user.familyId);
  if (user?.family?.id) ids.add(user.family.id);
  for (const family of user?.families || []) {
    if (family?.id) ids.add(family.id);
  }
  return [...ids];
}

function getFamilyNoteReason(metadata: any) {
  const category = String(metadata?.category || metadata?.type || '').toLowerCase();
  if (['medicine', 'health', 'suc_khoe', 'suc khoe'].some((item) => category.includes(item))) {
    return 'medicine_or_health_note_updated';
  }
  if (['school', 'hoc_tap', 'hoc tap'].some((item) => category.includes(item))) return 'school_note_updated';
  return 'family_note_updated';
}

function getCategoryAmount(report: { categories?: Array<{ category: string; amount: number }> }, category: string) {
  return report.categories?.find((item) => item.category === category)?.amount || 0;
}

function getPreviousMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

function getDaysUntil(from: Date, to: Date) {
  const fromDay = startOfIctDay(from).getTime();
  const toDay = startOfIctDay(to).getTime();
  return Math.round((toDay - fromDay) / (24 * 60 * 60 * 1000));
}
