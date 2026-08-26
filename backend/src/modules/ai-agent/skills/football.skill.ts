import { Injectable, Logger } from '@nestjs/common';
import { normalizeSearchText } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { toolSuccess, toolError } from '../ai-tool-runtime';
import { FootballService } from '../../football/football.service';

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

  constructor(private readonly footballService: FootballService) {}

  private readonly leagueMap: Record<string, string> = {
    'ngoai hang anh': 'PL', 'premier league': 'PL',
    'la liga': 'PD', 'tay ban nha': 'PD',
    'bundesliga': 'BL1', 'duc': 'BL1',
    'serie a': 'SA', 'y': 'SA',
    'champions league': 'CL', 'c1': 'CL',
    'ligue 1': 'FL1', 'phap': 'FL1',
    'eredivisie': 'DED', 'ha lan': 'DED',
    'primeira liga': 'PPL', 'bo dao nha': 'PPL',
    'championship': 'ELC', 'hang nhat anh': 'ELC',
    'brazil serie a': 'BSA', 'brasileirao': 'BSA', 'brazil': 'BSA',
    'world cup': 'WC', 'the gioi': 'WC',
    'euro': 'EC', 'european championship': 'EC',
  };

  getSystemPrompt(_context: AiSkillContext): string {
    return `⚽ FOOTBALL ASSISTANT:
- Always use the "vietnamTime" field (Vietnam local time ICT GMT+7, e.g. "20:00 26/08") for match kick-off time in the output. NEVER use raw "utcDate" directly.
- Group matches cleanly by Competition/League (e.g. 🇻🇳 Đội tuyển Việt Nam, 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League, 🇪🇸 La Liga, 🇩🇪 Bundesliga, 🇮🇹 Serie A, 🇫🇷 Ligue 1, 🇪🇺 Champions League).
- Format output clearly and beautifully with bold section headers and bullet points:

<b>⚽ LỊCH THI ĐẤU BÓNG ĐÁ</b>

<b>[League Emoji] [League Name]</b>
• <b>HH:mm (DD/MM)</b>: [Team A] vs [Team B] <i>(Status/Score)</i>

- Shorten long official team names for clean mobile readability (e.g. "Real Madrid" instead of "Real Madrid CF", "Barcelona" instead of "FC Barcelona", "Bayern Munich" instead of "FC Bayern München", "Man City" instead of "Manchester City FC", "Man United" instead of "Manchester United FC", "Tottenham" instead of "Tottenham Hotspur FC", "PSG" instead of "Paris Saint-Germain FC", "Atletico Madrid" instead of "Club Atlético de Madrid", "Real Sociedad" instead of "Real Sociedad de Fútbol").
- Do NOT output long messy single lines separated by pipes (|). Always group by competition with clean line breaks.
- If the user does not name a specific league or team (e.g. "lich thi dau bong da hom nay"), call get_matches with NO "league" argument — it returns matches across all top leagues plus V-League/Vietnam national team in ONE call. Never ask the user which league, and never call get_matches once per league to cover "all leagues" yourself.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_matches',
          description: 'Get football match schedules or results. Always call this for football/match questions — never guess or hallucinate matches from memory. Omit "league" to get matches across all top leagues (and Vietnam) in a single call.',
          parameters: {
            type: 'object',
            properties: {
              league: { type: 'string', description: 'Optional. PL, PD, BL1, SA, FL1, DED, PPL, ELC, BSA, CL, WC, EC. Omit when the user did not name a specific league/team — the result already includes V-League/Vietnam national team matches.' },
              status: { type: 'string', description: 'SCHEDULED, LIVE, or FINISHED' },
              dateFrom: { type: 'string', description: 'YYYY-MM-DD' },
              dateTo: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: [],
          },
        },
      },
    ];
  }

  // LLM-first: always let the LLM call get_matches tool
  async tryDirectAnswer(_context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    return undefined;
  }

  private isAllLeaguesArg(league: string) {
    const normalized = normalizeSearchText(league || '');
    return !normalized || ['tat ca', 'all', 'toan bo', 'moi giai'].includes(normalized);
  }

  private enrichMatchesWithVietnamTime(matches: any[]) {
    if (!Array.isArray(matches)) return matches;
    return matches.map((m) => {
      if (!m || !m.utcDate) return m;
      const localTime = this.getVietnamDateTimeParts(new Date(m.utcDate));
      return {
        ...m,
        vietnamTime: `${localTime.hourText}:${localTime.minuteText} ${localTime.day}/${localTime.month}`,
        vietnamDate: localTime.dateKey,
      };
    });
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    if (toolName !== 'get_matches') return undefined;

    try {
      const dateRange = args.dateFrom && args.dateTo
        ? { dateFrom: args.dateFrom, dateTo: args.dateTo }
        : this.resolveDefaultDateRange(normalizeSearchText(context.userMessage || ''));

      if (this.isAllLeaguesArg(args.league)) {
        const matches = await this.footballService.getAllFreeMatches(dateRange.dateFrom, dateRange.dateTo);
        return toolSuccess(toolName, this.enrichMatchesWithVietnamTime(matches));
      }

      const leagueCode = this.resolveLeagueCode(args.league);
      if (!leagueCode) return toolError(toolName, `Không tìm thấy mã giải đấu cho "${args.league}".`);

      const matches = await this.footballService.getMatchesForLeague(leagueCode, dateRange.dateFrom, dateRange.dateTo);
      return toolSuccess(toolName, this.enrichMatchesWithVietnamTime(matches));
    } catch (error: any) {
      return toolError(toolName, error.message);
    }
  }

  private resolveLeagueCode(input: string): string | undefined {
    const normalized = (input || '').toLowerCase().trim();
    if (['PL', 'PD', 'BL1', 'SA', 'FL1', 'DED', 'PPL', 'ELC', 'BSA', 'CL', 'WC', 'EC'].includes(normalized.toUpperCase())) return normalized.toUpperCase();
    return this.leagueMap[normalized];
  }

  private resolveLeagueCodeFromText(normalizedText: string): string | undefined {
    for (const [name, code] of Object.entries(this.leagueMap)) {
      // Use boundary to ensure 'y' does not match inside 'nay' or 'ngay'
      const regex = new RegExp(`\\b${name}\\b`, 'i');
      if (regex.test(normalizedText)) return code;
    }
    const codeMatch = normalizedText.match(/\b(pl|pd|bl1|sa|fl1|ded|ppl|elc|bsa|cl|wc|ec)\b/i);
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

    // 3. Group by competition
    const byComp = new Map<string, string[]>();
    for (const m of filtered.slice(0, 18)) {
      const localTime = this.getVietnamDateTimeParts(new Date(m.utcDate));
      const timeStr = `${localTime.hourText}:${localTime.minuteText} (${localTime.day}/${localTime.month})`;
      const compName = m.competitionName || 'Bóng đá';

      let scoreStr = '';
      if (m.status === 'FINISHED') {
        const hasPens = m.homePenalties !== null && m.homePenalties !== undefined && m.awayPenalties !== null && m.awayPenalties !== undefined;
        if (hasPens) {
          const regularHome = m.homeScore - m.homePenalties;
          const regularAway = m.awayScore - m.awayPenalties;
          scoreStr = ` <b>(${regularHome}-${regularAway}, pen: ${m.homePenalties}-${m.awayPenalties})</b>`;
        } else {
          scoreStr = ` <b>(${m.homeScore}-${m.awayScore})</b>`;
        }
      } else if (m.status === 'LIVE' || m.status === 'IN_PLAY') {
        scoreStr = ` <i>(Đang đá: ${m.homeScore}-${m.awayScore})</i>`;
      }

      const line = `• <b>${timeStr}</b>: ${m.homeTeam} vs ${m.awayTeam}${scoreStr}`;
      byComp.set(compName, [...(byComp.get(compName) || []), line]);
    }

    const outputLines = ['<b>⚽ LỊCH THI ĐẤU BÓNG ĐÁ</b>', ''];
    for (const [comp, compLines] of byComp) {
      outputLines.push(`<b>${comp}</b>`);
      outputLines.push(...compLines);
      outputLines.push('');
    }

    return outputLines.join('\n').trim();
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
