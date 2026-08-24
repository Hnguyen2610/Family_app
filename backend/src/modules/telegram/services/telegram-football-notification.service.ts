import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { FootballMatch, FootballService } from '../../football/football.service';
import { getIctDateKey, getIctNow } from '../../../utils/timezone.util';
import { TelegramService } from '../telegram.service';

const FOOTBALL_DAILY_TELEGRAM_TYPE = 'FOOTBALL_DAILY_SCHEDULE';
const FOOTBALL_DAILY_LIMIT = 18;

export type FootballTelegramNotificationSummary = {
  dateKey: string;
  matchCount: number;
  usersScanned: number;
  sent: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class TelegramFootballNotificationService {
  private readonly logger = new Logger(TelegramFootballNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly footballService: FootballService,
    private readonly telegramService: TelegramService,
  ) {}

  @Cron('0 7 * * *', {
    name: 'football-daily-telegram',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async sendTodayFootballSchedule(): Promise<FootballTelegramNotificationSummary> {
    const now = getIctNow();
    const dateKey = getIctDateKey(now);
    const title = `Lịch bóng đá hôm nay - ${dateKey}`;
    const summary: FootballTelegramNotificationSummary = {
      dateKey,
      matchCount: 0,
      usersScanned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    this.logger.log(`Checking football schedule for Telegram notifications on ${dateKey}...`);

    let matches: FootballMatch[] = [];
    try {
      matches = await this.footballService.getTodayMatches(dateKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch today's football matches for Telegram: ${message}`);
      summary.failed = 1;
      return summary;
    }

    const visibleMatches = matches
      .filter((match) => !['CANCELLED', 'POSTPONED', 'SUSPENDED'].includes(match.status))
      .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    if (visibleMatches.length === 0) {
      this.logger.log(`No football matches found for Telegram notifications on ${dateKey}.`);
      return summary;
    }
    summary.matchCount = visibleMatches.length;

    const users = await this.prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: {
        id: true,
        name: true,
        notificationSettings: true,
      },
    });

    const eligibleUsers = users.filter((user) => this.isFootballTelegramEnabled(user.notificationSettings));
    summary.usersScanned = eligibleUsers.length;
    if (eligibleUsers.length === 0) {
      this.logger.log('No Telegram-linked users enabled for football notifications.');
      return summary;
    }

    const message = this.buildFootballScheduleMessage(dateKey, visibleMatches);
    const results = await Promise.allSettled(
      eligibleUsers.map((user) => this.sendToUserOncePerDay(user.id, title, message, dateKey, visibleMatches.length)),
    );

    summary.sent = results.filter((result) => result.status === 'fulfilled' && result.value === true).length;
    summary.skipped = results.filter((result) => result.status === 'fulfilled' && result.value === false).length;
    summary.failed += results.filter((result) => result.status === 'rejected').length;
    this.logger.log(
      `Football Telegram notifications finished for ${dateKey}: sent=${summary.sent}, skipped=${summary.skipped}, failed=${summary.failed}`,
    );
    return summary;
  }

  private isFootballTelegramEnabled(notificationSettings: unknown) {
    const settings = this.toObject(notificationSettings);
    return settings.FOOTBALL !== false &&
      settings.football !== false &&
      settings.footballTelegram !== false &&
      settings.telegramFootball !== false;
  }

  private async sendToUserOncePerDay(
    userId: string,
    title: string,
    message: string,
    dateKey: string,
    matchCount: number,
  ) {
    const alreadySent = await this.prisma.notificationDeliveryLog.findFirst({
      where: {
        userId,
        type: FOOTBALL_DAILY_TELEGRAM_TYPE,
        channel: 'telegram',
        status: 'SENT',
        title,
      },
      select: { id: true },
    });
    if (alreadySent) return false;

    const ok = await this.telegramService.sendMessageToUser(userId, message);
    await this.prisma.notificationDeliveryLog.create({
      data: {
        userId,
        type: FOOTBALL_DAILY_TELEGRAM_TYPE,
        channel: 'telegram',
        status: ok ? 'SENT' : 'FAILED',
        title,
        body: message,
        metadata: { dateKey, matchCount, source: 'football-data.org' },
        errorMessage: ok ? null : 'telegram_send_failed',
      },
    });
    return ok;
  }

  private buildFootballScheduleMessage(dateKey: string, matches: FootballMatch[]) {
    const displayed = matches.slice(0, FOOTBALL_DAILY_LIMIT);
    const byCompetition = new Map<string, FootballMatch[]>();
    for (const match of displayed) {
      const key = match.competitionName || 'Bóng đá';
      byCompetition.set(key, [...(byCompetition.get(key) || []), match]);
    }

    const lines = [
      `<b>⚽ Lịch bóng đá hôm nay (${this.escapeTelegramHtml(dateKey)})</b>`,
      '',
    ];

    for (const [competition, competitionMatches] of byCompetition) {
      lines.push(`<b>${this.escapeTelegramHtml(competition)}</b>`);
      for (const match of competitionMatches) {
        lines.push(`• ${this.formatMatchLine(match)}`);
      }
      lines.push('');
    }

    const remaining = matches.length - displayed.length;
    if (remaining > 0) {
      lines.push(`Còn ${remaining} trận khác trong app.`);
    }

    return lines.join('\n').trim();
  }

  private formatMatchLine(match: FootballMatch) {
    const time = this.formatIctTime(match.utcDate);
    const home = this.escapeTelegramHtml(match.homeTeam || 'Đội nhà');
    const away = this.escapeTelegramHtml(match.awayTeam || 'Đội khách');
    const score = this.formatScore(match);
    const status = this.formatStatus(match.status);

    if (score) {
      return `${time} · ${home} ${score} ${away} · ${status}`;
    }
    return `${time} · ${home} vs ${away} · ${status}`;
  }

  private formatIctTime(utcDate: string) {
    const date = new Date(utcDate);
    if (Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  private formatScore(match: FootballMatch) {
    if (match.homeScore === null || match.homeScore === undefined || match.awayScore === null || match.awayScore === undefined) {
      return '';
    }
    return `${match.homeScore}-${match.awayScore}`;
  }

  private formatStatus(status: string) {
    const labels: Record<string, string> = {
      FINISHED: 'đã kết thúc',
      LIVE: 'đang đá',
      IN_PLAY: 'đang đá',
      PAUSED: 'nghỉ giữa hiệp',
      SCHEDULED: 'sắp diễn ra',
      TIMED: 'sắp diễn ra',
    };
    return labels[status] || status.toLowerCase();
  }

  private toObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private escapeTelegramHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
