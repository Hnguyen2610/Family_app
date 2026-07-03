import { Injectable, Logger } from '@nestjs/common';
import { AiIntent, normalizeSearchText } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { toolSuccess, toolError } from '../ai-tool-results';

type FootballDateRange = {
  dateFrom: string;
  dateTo: string;
  displayDates?: string[];
  displayFrom?: string;
  displayTo?: string;
  morningOnlyEnd: boolean;
};

@Injectable()
export class FootballSkill implements AiSkill {
  name = 'FootballSkill';
  private readonly logger = new Logger(FootballSkill.name);
  private readonly apiKey = process.env.FOOTBALL_DATA_API_KEY;
  private readonly baseUrl = 'https://api.football-data.org/v4';
  private readonly directAnswerCache = new Map<string, { expiresAt: number; content: string }>();
  private readonly directAnswerCacheTtlMs = 5 * 60 * 1000;

  // Major leagues list to look up by default (including World Cup)
  private readonly defaultLeagues = ['PL', 'PD', 'BL1', 'SA', 'CL', 'FL1', 'WC'];

  private readonly leagueMap: Record<string, string> = {
    'ngoai hang anh': 'PL', 'premier league': 'PL',
    'la liga': 'PD', 'tay ban nha': 'PD',
    'bundesliga': 'BL1', 'duc': 'BL1',
    'serie a': 'SA', 'y': 'SA',
    'champions league': 'CL', 'c1': 'CL',
    'ligue 1': 'FL1', 'phap': 'FL1',
    'world cup': 'WC', 'the gioi': 'WC',
  };

  canHandle(intent: AiIntent): boolean {
    return intent === 'football';
  }

  getSystemPrompt(context: AiSkillContext): string {
    return `⚽ FOOTBALL ASSISTANT:
- You show football match schedules and standings.
- Keep output formatted EXACTLY like this:
  - HH:mm DD/MM | League Name | Team A vs Team B (Highlight winner or show score if finished).
- NEVER guess or hallucinate matches. Only output what is returned from the tool.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_matches',
          description: 'Get football match schedules or results.',
          parameters: {
            type: 'object',
            properties: {
              league: { type: 'string', description: 'PL, PD, BL1, SA, CL, WC' },
              status: { type: 'string', description: 'SCHEDULED, LIVE, or FINISHED' },
              dateFrom: { type: 'string', description: 'YYYY-MM-DD' },
              dateTo: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['league'],
          },
        },
      },
    ];
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    const message = normalizeSearchText(context.userMessage || '');

    let resolvedLeague = this.resolveLeagueCodeFromText(message);
    const dateRange = this.resolveDefaultDateRange(message);
    const cacheKey = `${resolvedLeague || 'top'}:${dateRange.dateFrom}:${dateRange.dateTo}`;
    const cached = this.directAnswerCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { content: cached.content, direct: true };
    }

    try {
      let matches: any[] = [];

      if (resolvedLeague) {
        this.logger.debug(`Fetching direct matches for single league: ${resolvedLeague}`);
        const raw = await this.fetchApi(`${this.baseUrl}/competitions/${resolvedLeague}/matches?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}`, 'get_matches');
        matches = Array.isArray(raw?.data) ? raw.data : [];
      } else {
        this.logger.debug(`Fetching direct matches for top leagues: ${this.defaultLeagues.join(', ')}`);
        // Fetch all top leagues concurrently to avoid rate limit sequential latency
        const promises = this.defaultLeagues.map(async (league) => {
          try {
            const raw = await this.fetchApi(`${this.baseUrl}/competitions/${league}/matches?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}`, 'get_matches');
            return Array.isArray(raw?.data) ? raw.data : [];
          } catch (e: any) {
            this.logger.warn(`Failed to fetch for league ${league}: ${e.message}`);
            return [];
          }
        });

        const results = await Promise.all(promises);
        matches = results.flat();
      }

      const content = this.formatMatchesForUser(matches, dateRange);
      this.directAnswerCache.set(cacheKey, {
        content,
        expiresAt: Date.now() + this.directAnswerCacheTtlMs,
      });
      return { content, direct: true };
    } catch (error: any) {
      this.logger.warn(`Football direct answer failed: ${error.message}`);
      return {
        content: `Không lấy được lịch bóng đá từ API lúc này. (Gói API miễn phí giới hạn 10 requests/phút).`,
        direct: true,
      };
    }
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    const leagueCode = this.resolveLeagueCode(args.league);
    if (!leagueCode) return toolError(toolName, `Không tìm thấy mã giải đấu cho "${args.league}".`);

    try {
      if (toolName === 'get_matches') {
        const dateRange = args.dateFrom && args.dateTo
          ? { dateFrom: args.dateFrom, dateTo: args.dateTo }
          : this.resolveDefaultDateRange(normalizeSearchText(context.userMessage || ''));
        return await this.fetchApi(`${this.baseUrl}/competitions/${leagueCode}/matches?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}`, toolName);
      }
    } catch (error: any) {
      return toolError(toolName, error.message);
    }
  }

  private resolveLeagueCode(input: string): string | undefined {
    const normalized = (input || '').toLowerCase().trim();
    if (['PL', 'PD', 'BL1', 'SA', 'CL', 'WC'].includes(normalized.toUpperCase())) return normalized.toUpperCase();
    return this.leagueMap[normalized];
  }

  private resolveLeagueCodeFromText(normalizedText: string): string | undefined {
    for (const [name, code] of Object.entries(this.leagueMap)) {
      // Use boundary to ensure 'y' does not match inside 'nay' or 'ngay'
      const regex = new RegExp(`\\b${name}\\b`, 'i');
      if (regex.test(normalizedText)) return code;
    }
    const codeMatch = normalizedText.match(/\b(pl|pd|bl1|sa|cl|wc)\b/i);
    return codeMatch?.[1]?.toUpperCase();
  }

  private resolveDefaultDateRange(message: string): FootballDateRange {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const explicitDates = this.parseExplicitVietnamDates(message);

    if (explicitDates.length > 0) {
      const sortedDates = explicitDates.sort((a, b) => a.getTime() - b.getTime());
      const firstDate = sortedDates[0];
      const lastDate = sortedDates[sortedDates.length - 1];
      const firstDateKey = this.getVietnamDateKey(firstDate);
      const lastDateKey = this.getVietnamDateKey(lastDate);
      const previousDate = new Date(firstDate);
      previousDate.setUTCDate(previousDate.getUTCDate() - 1);
      return {
        dateFrom: this.getVietnamDateKey(previousDate),
        dateTo: lastDateKey,
        displayDates: sortedDates.map((date) => this.getVietnamDateKey(date)),
        displayFrom: firstDateKey,
        displayTo: lastDateKey,
        morningOnlyEnd: false,
      };
    }

    if (message.includes('ngay mai') || message.includes('tomorrow')) {
      const todayStr = this.getVietnamDateKey(today);
      const tomorrowStr = this.getVietnamDateKey(tomorrow);
      return {
        dateFrom: todayStr,
        dateTo: tomorrowStr,
        displayFrom: todayStr,
        displayTo: tomorrowStr,
        morningOnlyEnd: true,
      };
    }

    return {
      dateFrom: this.getVietnamDateKey(yesterday),
      dateTo: this.getVietnamDateKey(tomorrow),
      displayFrom: this.getVietnamDateKey(today),
      displayTo: this.getVietnamDateKey(tomorrow),
      morningOnlyEnd: true,
    };
  }

  private parseExplicitVietnamDates(message: string): Date[] {
    const dates: Date[] = [];
    const seen = new Set<string>();
    const datePattern = /\b([0-3]?\d)[\/-]([01]?\d)(?:[\/-](\d{2,4}))?\b/g;
    const currentYear = Number(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
    }).format(new Date()));

    let match: RegExpExecArray | null;
    while ((match = datePattern.exec(message)) !== null) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) continue;

      const rawYear = match[3] ? Number(match[3]) : currentYear;
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      const key = `${year}-${month}-${day}`;
      if (seen.has(key)) continue;

      seen.add(key);
      dates.push(new Date(Date.UTC(year, month - 1, day)));
    }

    return dates;
  }

  private getVietnamDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  private async fetchApi(url: string, toolName: string) {
    if (!this.apiKey) throw new Error('API Key missing');
    const response = await fetch(url, { headers: { 'X-Auth-Token': this.apiKey } });
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any;
      throw new Error(err.message || 'API Error');
    }
    const data = await response.json() as any;
    if (toolName === 'get_matches') {
      return toolSuccess(toolName, (data.matches || []).map((m: any) => {
        return {
          utcDate: m.utcDate,
          competitionName: m.competition?.name || 'Bóng đá',
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          status: m.status,
          homeScore: m.score?.fullTime?.home,
          awayScore: m.score?.fullTime?.away,
          homePenalties: m.score?.penalties?.home,
          awayPenalties: m.score?.penalties?.away,
        };
      }));
    }
    return toolSuccess(toolName, data);
  }

  private formatMatchesForUser(matches: any[], dateRange: FootballDateRange) {
    if (!matches || matches.length === 0) {
      return `⚽ Không có trận đấu nào được lên lịch ${this.formatDateRangeLabel(dateRange)} từ các giải đấu hàng đầu.`;
    }

    const filtered = matches.filter((m) => {
      const localTime = this.getVietnamDateTimeParts(new Date(m.utcDate));
      if (dateRange.displayDates?.length) return dateRange.displayDates.includes(localTime.dateKey);
      if (dateRange.displayFrom && localTime.dateKey < dateRange.displayFrom) return false;
      if (dateRange.displayTo && localTime.dateKey > dateRange.displayTo) return false;
      if (dateRange.morningOnlyEnd && localTime.dateKey === dateRange.displayTo && localTime.hour >= 12) return false;
      return true;
    });

    if (filtered.length === 0) {
      return `⚽ Không có trận đấu nào được lên lịch ${this.formatDateRangeLabel(dateRange)} từ các giải đấu hàng đầu.`;
    }

    // 2. Sort matches chronologically
    filtered.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

    // 3. Format lines
    const lines = filtered.slice(0, 15).map((m) => {
      const localTime = this.getVietnamDateTimeParts(new Date(m.utcDate));
      const timeStr = `${localTime.hourText}:${localTime.minuteText} ${localTime.day}/${localTime.month}`;

      let scoreStr = '';
      if (m.status === 'FINISHED') {
        const hasPens = m.homePenalties !== null && m.homePenalties !== undefined && m.awayPenalties !== null && m.awayPenalties !== undefined;
        if (hasPens) {
          const regularHome = m.homeScore - m.homePenalties;
          const regularAway = m.awayScore - m.awayPenalties;
          scoreStr = ` (${regularHome}-${regularAway}, pen: ${m.homePenalties}-${m.awayPenalties})`;
        } else {
          scoreStr = ` (${m.homeScore}-${m.awayScore})`;
        }
      } else if (m.status === 'LIVE') {
        scoreStr = ` (Đang đá: ${m.homeScore}-${m.awayScore})`;
      }

      return `- ${timeStr} | ${m.competitionName} | ${m.homeTeam} vs ${m.awayTeam}${scoreStr}`;
    });

    return `Lịch thi đấu:\n${lines.join('\n')}`;
  }

  private formatDateRangeLabel(dateRange: FootballDateRange) {
    if (dateRange.displayDates?.length) {
      return `ngày ${dateRange.displayDates.map((date) => this.formatVietnamDisplayDate(date)).join(' và ')}`;
    }
    if (dateRange.displayFrom && dateRange.displayFrom === dateRange.displayTo) {
      return `ngày ${this.formatVietnamDisplayDate(dateRange.displayFrom)}`;
    }
    return 'hôm nay và sáng ngày mai';
  }

  private formatVietnamDisplayDate(dateKey: string) {
    const [, month, day] = dateKey.split('-');
    return `${Number(day)}/${Number(month)}`;
  }

  private getVietnamDateTimeParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '00';
    const year = value('year');
    const month = value('month');
    const day = value('day');
    const hourText = value('hour');
    const minuteText = value('minute');

    return {
      dateKey: `${year}-${month}-${day}`,
      day: Number(day),
      month: Number(month),
      hour: Number(hourText),
      hourText,
      minuteText,
    };
  }
}
