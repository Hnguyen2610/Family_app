import { FOOTBALL_TEAM_ALIASES, FOOTBALL_TEAM_LABELS } from './football-team-aliases';

type FootballSource = {
  title?: string;
  url?: string;
  content?: string;
  rawContent?: string;
};

type FootballFixture = {
  time?: string;
  date?: string;
  league: string;
  match: string;
  sourcePriority?: number;
};

export class FootballScheduleSearchHelper {
  isScheduleQuery(query: string) {
    const normalized = this.normalizeVietnamese(query);
    if (normalized.includes('world cup')) return true;
    const asksTeamSchedule =
      /\bda\s+(hom nao|khi nao|luc nao|ngay nao|may gio)\b/.test(normalized) ||
      /\b(hom nao|khi nao|luc nao|ngay nao|may gio)\b.*\bda\b/.test(normalized);
    const asksFixture = normalized.includes('lich thi dau') || normalized.includes('tran tiep theo') || normalized.includes('tran sap toi');
    return asksTeamSchedule || asksFixture || (normalized.includes('bong da') && normalized.includes('tran'));
  }

  formatScheduleResult(query: string, answer: string, sources: FootballSource[]) {
    const sourceText = [
      answer,
      ...sources.flatMap((source) => [source?.title, source?.content, source?.rawContent]),
    ].filter(Boolean).join('\n');
    const specificTeam = this.extractSpecificTeamFromQuery(query);
    const strictFixtures = this.dedupeFixtures([
      ...this.extractStrictFootballFixtures(answer, query, sourceText, 0),
      ...(specificTeam ? [] : this.extractStrictFootballFixtures(sourceText, query, sourceText, 3)),
      ...this.extractDateOnlyFootballFixtures(answer, query, sourceText, 1),
      ...this.extractDateOnlyFootballFixtures(sourceText, query, sourceText, 4),
    ]);
    const teamFilteredFixtures = this.filterSpecificTeamFixtures(specificTeam, strictFixtures);
    const upcomingFixtures = this.filterUpcomingTeamFixtures(query, specificTeam, teamFilteredFixtures);
    const dateFilteredFixtures = this.filterRequestedDateFixtures(query, upcomingFixtures);
    const filteredFixtures = this.filterTopLeagueFixtures(query, dateFilteredFixtures);

    if (strictFixtures.length > 0) {
      if (dateFilteredFixtures.length === 0) {
        if (specificTeam && this.shouldRequireUpcomingFixture(query)) {
          return 'Không tìm thấy trận sắp tới phù hợp trong nguồn tìm kiếm.';
        }
        return 'Không tìm thấy lịch thi đấu phù hợp cho hôm nay và rạng sáng mai.';
      }
      return this.formatFootballFixtures(filteredFixtures.length > 0 ? filteredFixtures : dateFilteredFixtures);
    }

    const fixtures = this.filterSpecificTeamFixtures(specificTeam, this.extractFootballFixtures(answer, query));
    const fallbackFixtures = fixtures.length
      ? fixtures
      : this.filterSpecificTeamFixtures(specificTeam, this.extractFootballFixtures(sourceText, query));
    const sourceLines = this.formatSourceLines(sources, 2);

    if (fallbackFixtures.length > 0) {
      const lines = fallbackFixtures.slice(0, 16).map((fixture) => {
        const date = fixture.date ? ` ${fixture.date}` : '';
        const time = fixture.time || '--:--';
        return `- ${time}${date} | ${fixture.league} | ${fixture.match}`;
      });
      const hidden = fallbackFixtures.length - lines.length;
      const more = hidden > 0 ? `\n...còn ${hidden} trận khác trong nguồn.` : '';
      return `Lịch thi đấu:\n${lines.join('\n')}${more}`;
    }

    const cleanAnswer = this.keepScheduleOnly(answer);
    if (cleanAnswer) return cleanAnswer;

    if (specificTeam && this.shouldRequireUpcomingFixture(query)) {
      return `Không tìm thấy trận sắp tới của ${this.formatTeamLabel(specificTeam)} trong nguồn tìm kiếm.`;
    }

    return sourceLines
      ? `Không tìm thấy lịch thi đấu đủ giờ trong nguồn.\nNguồn:\n${sourceLines}`
      : `Không tìm thấy lịch thi đấu đủ giờ cho: ${query}`;
  }

  private extractStrictFootballFixtures(text: string, query: string, fullText: string, sourcePriority = 0) {
    const fixtures: FootballFixture[] = [];
    const normalizedText = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[•–—]/g, '-');
    const chunks = normalizedText
      .split(/\n|;|\.(?=\s+[A-ZÀ-ỴA-Za-zĐđ])/)
      .map((line) => line.replace(/^[-\s]+/, '').trim())
      .filter((line) => this.isLikelyScheduleLine(line))
      .filter(Boolean);

    for (const line of chunks) {
      fixtures.push(...this.extractFixturesFromLine(line, query, fullText, sourcePriority));
    }

    return fixtures;
  }

  private extractFixturesFromLine(line: string, query: string, fullText: string, sourcePriority = 0) {
    const timeMatch = line.match(/\b([0-2]?\d(?::|h)[0-5]\d|[0-2]?\d\s*giờ)\b/i);
    if (!timeMatch) return [];

    const fixtures: FootballFixture[] = [];
    const pairPattern = /([^,.;|()\n-]{2,45}?)\s+(?:vs\.?|v\.?|gap|gặp|dau|đấu|cham tran|chạm trán)\s+([^,.;|()\n-]{2,45}?)(?=\s*(?:[,.;|()/-]|\band\b|\bva\b|\bvà\b|\bat\b|\bluc\b|\blúc\b|\bvao\b|\bvào\b|are scheduled|is scheduled|dien ra|diễn ra|$))/gi;
    let match: RegExpExecArray | null;
    const englishFixture = this.extractAtTimeFixture(line, query, sourcePriority, fullText);
    if (englishFixture) fixtures.push(englishFixture);

    while ((match = pairPattern.exec(line)) !== null) {
      const left = this.normalizeFixtureTeamName(match[1]);
      const right = this.normalizeFixtureTeamName(match[2]);
      if (!left || !right) continue;

      const date = this.extractFixtureDate(line, timeMatch.index || 0)
        || this.inferRelativeFixtureDate(line, query);
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      const leagueFromPipe = parts.length >= 3 ? parts[1] : '';
      const league = leagueFromPipe && !/\bvs\.?\b/i.test(leagueFromPipe)
        ? leagueFromPipe
        : this.inferFootballLeague(query, `${line}\n${fullText}`);

      fixtures.push({
        time: this.cleanTime(timeMatch[1]),
        date,
        league,
        match: `${left} vs ${right}`,
        sourcePriority,
      });
    }

    return fixtures;
  }

  private isLikelyScheduleLine(line: string) {
    const normalized = this.normalizeVietnamese(line);
    const hasTime = /\b\d{1,2}\s*(?::|h)\s*\d{2}\b/.test(normalized);
    const hasDate = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\b/i.test(line);
    if (!hasTime && !hasDate) return false;

    const rejectPhrases = [
      'nhan dinh',
      'du doan',
      'soi keo',
      'video',
      'highlight',
      'ban thang',
      'phong do',
      'chu nha',
      'can bay',
      'test dang cho doi',
      'html',
      'tin tuc',
      'ket qua',
    ];
    if (rejectPhrases.some((phrase) => normalized.includes(phrase))) return false;

    const explicitScheduleSignals = [
      'lich thi dau',
      'world cup',
      'champions league',
      'europa league',
      'premier league',
      'la liga',
      'serie a',
      'bundesliga',
      'ligue 1',
      'v-league',
      'v league',
      '|',
      ' vs ',
    ];
    return explicitScheduleSignals.some((signal) => normalized.includes(signal));
  }

  private shouldFilterTopLeagues(query: string) {
    const normalizedQuery = this.normalizeVietnamese(query);
    return normalizedQuery.includes('hang dau') || normalizedQuery.includes('top') || normalizedQuery.includes('world cup');
  }

  private extractAtTimeFixture(line: string, query: string, sourcePriority = 0, fullText = '') {
    const match = line.match(/([^,.;|()\n-]{2,45}?)\s+(?:vs\.?|v\.?)\s+([^,.;|()\n-]{2,45}?)\s+(?:at|luc|lúc|vao|vào)\s+([0-2]?\d(?::|h)[0-5]\d)/i);
    if (!match) return undefined;

    const left = this.normalizeFixtureTeamName(match[1]);
    const right = this.normalizeFixtureTeamName(match[2]);
    if (!left || !right) return undefined;

    const timeIndex = (match.index || 0) + match[0].lastIndexOf(match[3]);
    const date = this.extractFixtureDate(line, timeIndex)
      || this.inferRelativeFixtureDate(line, query);
    return {
      time: this.cleanTime(match[3]),
      date,
      league: this.inferFootballLeague(query, `${line}\n${fullText}`),
      match: `${left} vs ${right}`,
      sourcePriority,
    };
  }

  private extractFixtureDate(line: string, timeIndex: number) {
    const tail = line.slice(timeIndex);
    const dateAfterTime = tail.match(/(?:ngày|rạng sáng|rang sang)?\s*([0-3]?\d\/[01]?\d(?:\/\d{4})?)/i);
    if (dateAfterTime) return dateAfterTime[1].trim();

    const dateBeforeTime = line.slice(0, timeIndex).match(/([0-3]?\d\/[01]?\d(?:\/\d{4})?)\s*$/);
    if (dateBeforeTime) return dateBeforeTime[1].trim();

    const anyDate = line.match(/([0-3]?\d\/[01]?\d(?:\/\d{4})?)/);
    return anyDate?.[1]?.trim();
  }

  private inferRelativeFixtureDate(line: string, query: string) {
    const normalizedLine = this.normalizeVietnamese(line);
    const dates = this.getRequestedFootballDateList(query);
    if (dates.length === 0) return undefined;

    if (normalizedLine.includes('tomorrow') || normalizedLine.includes('ngay mai') || normalizedLine.includes('rang sang')) {
      return dates[1] || dates[0];
    }
    if (normalizedLine.includes('today') || normalizedLine.includes('hom nay')) {
      return dates[0];
    }
    return undefined;
  }

  private dedupeFixtures(fixtures: FootballFixture[]) {
    const byMatch = new Map<string, FootballFixture>();

    for (const fixture of fixtures) {
      const key = this.buildFixtureKey(fixture);
      const current = byMatch.get(key);
      if (!current || this.scoreFixture(fixture) > this.scoreFixture(current)) {
        byMatch.set(key, fixture);
      }
    }

    return Array.from(byMatch.values());
  }

  private filterSpecificTeamFixtures(specificTeam: string, fixtures: FootballFixture[]) {
    if (!specificTeam) return fixtures;
    return fixtures.filter((fixture) => {
      const [left = '', right = ''] = fixture.match.split(/\s+vs\s+/i);
      return [left, right].some((team) => this.canonicalTeamName(team) === specificTeam);
    });
  }

  private filterUpcomingTeamFixtures(query: string, specificTeam: string, fixtures: FootballFixture[]) {
    if (!specificTeam || !this.shouldRequireUpcomingFixture(query)) return fixtures;

    const todayKey = this.getTodayDateNumber();
    return fixtures.filter((fixture) => {
      const value = this.getFixtureDateNumber(fixture.date);
      return value !== undefined && value >= todayKey;
    });
  }

  private buildFixtureKey(fixture: FootballFixture) {
    const [left = '', right = ''] = fixture.match.split(/\s+vs\s+/i);
    const teams = [this.canonicalTeamName(left), this.canonicalTeamName(right)].sort();
    return this.normalizeVietnamese(`${this.canonicalLeagueName(fixture.league)}|${teams.join('|')}`);
  }

  private scoreFixture(fixture: FootballFixture) {
    let score = 0;
    score += fixture.sourcePriority || 0;
    if (fixture.date) score += 2;
    if (/[À-Ỵà-ỵĐđ]/.test(fixture.match)) score += 1;
    return score;
  }

  private canonicalLeagueName(value: string) {
    const normalized = this.normalizeVietnamese(value);
    if (normalized.includes('world cup')) return 'world cup';
    return normalized;
  }

  private canonicalTeamName(value: string) {
    const normalized = this.normalizeVietnamese(value)
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return FOOTBALL_TEAM_ALIASES[normalized] || normalized;
  }

  private formatTeamLabel(value: string) {
    return FOOTBALL_TEAM_LABELS[value] || value.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  private extractSpecificTeamFromQuery(query: string) {
    const normalized = this.normalizeVietnamese(query)
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const stopWords = new Set([
      'lich',
      'thi',
      'dau',
      'bong',
      'da',
      'hom',
      'nao',
      'khi',
      'luc',
      'ngay',
      'may',
      'gio',
      'la',
      'se',
      'tran',
      'tiep',
      'theo',
      'sap',
      'toi',
      'doi',
      'tuyen',
      'clb',
      'fc',
      'club',
      'national',
      'team',
      'cua',
      'vs',
      'gap',
    ]);

    const words = normalized
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));

    if (words.length === 0 || words.length > 3) return '';
    return this.canonicalTeamName(words.join(' '));
  }

  private shouldRequireUpcomingFixture(query: string) {
    const normalized = this.normalizeVietnamese(query);
    if (/\b(hom qua|yesterday|da dau|ket qua|ti so|ty so)\b/.test(normalized)) return false;
    return (
      /\bda\s+(hom nao|khi nao|luc nao|ngay nao|may gio)\b/.test(normalized) ||
      /\b(hom nao|khi nao|luc nao|ngay nao|may gio)\b.*\bda\b/.test(normalized) ||
      /\blich\s+thi\s+dau\b.*\b(tiep theo|sap toi|sau)\b/.test(normalized) ||
      /\btran\s+(tiep theo|sap toi|sau)\b/.test(normalized)
    );
  }

  private getTodayDateNumber() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
    const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
    const day = Number(parts.find((part) => part.type === 'day')?.value || 0);
    return year * 10000 + month * 100 + day;
  }

  private getFixtureDateNumber(date?: string) {
    const match = String(date || '').match(/([0-3]?\d)\/([01]?\d)(?:\/(\d{4}))?/);
    if (!match) return undefined;

    const today = new Date();
    const currentYear = Number(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
    }).format(today));
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? Number(match[3]) : currentYear;
    return year * 10000 + month * 100 + day;
  }

  private filterTopLeagueFixtures(query: string, fixtures: FootballFixture[]) {
    if (!this.shouldFilterTopLeagues(query)) return fixtures;

    return fixtures.filter((fixture) => {
      const league = this.normalizeVietnamese(fixture.league);
      return [
        'world cup',
        'champions league',
        'europa league',
        'premier league',
        'ngoai hang anh',
        'la liga',
        'serie a',
        'bundesliga',
        'ligue 1',
        'v league',
        'doi tuyen',
        'national',
        'qualification',
        'qualifiers',
      ].some((keyword) => league.includes(keyword));
    });
  }

  private filterRequestedDateFixtures(query: string, fixtures: FootballFixture[]) {
    const allowedDates = this.getRequestedFootballDateKeys(query);
    if (allowedDates.size === 0) return fixtures;

    return fixtures.filter((fixture) => {
      if (!fixture.date) return true;
      const dateKey = this.normalizeFootballDateKey(fixture.date);
      return !dateKey || allowedDates.has(dateKey);
    });
  }

  private getRequestedFootballDateKeys(query: string) {
    return new Set(this.getRequestedFootballDateList(query));
  }

  private getRequestedFootballDateList(query: string) {
    const keys: string[] = [];
    const datePattern = /([0-3]?\d)\/([01]?\d)(?:\/\d{4})?/g;
    let match: RegExpExecArray | null;

    while ((match = datePattern.exec(query)) !== null) {
      const key = `${Number(match[1])}/${Number(match[2])}`;
      if (!keys.includes(key)) keys.push(key);
    }

    if (keys.length === 0) {
      const normalizedQuery = this.normalizeVietnamese(query);
      const wantsTodayWindow = ['hom nay', 'ngay mai', 'rang sang', 'today', 'tomorrow'].some((signal) => normalizedQuery.includes(signal));
      if (!wantsTodayWindow) return keys;

      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      keys.push(this.formatVietnamDateKey(today));
      keys.push(this.formatVietnamDateKey(tomorrow));
    }

    return keys;
  }

  private normalizeFootballDateKey(value: string) {
    const match = String(value || '').match(/([0-3]?\d)\/([01]?\d)(?:\/\d{4})?/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : '';
  }

  private formatVietnamDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: 'numeric',
      month: 'numeric',
    }).formatToParts(date);
    const day = Number(parts.find((part) => part.type === 'day')?.value || 0);
    const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
    return `${day}/${month}`;
  }

  private formatFootballFixtures(fixtures: FootballFixture[]) {
    const lines = fixtures.slice(0, 20).map((fixture) => {
      const date = fixture.date ? ` ${fixture.date}` : '';
      const time = fixture.time || '--:--';
      return `- ${time}${date} | ${fixture.league} | ${fixture.match}`;
    });
    const hidden = fixtures.length - lines.length;
    const more = hidden > 0 ? `\n...còn ${hidden} trận khác.` : '';
    return `Lịch thi đấu:\n${lines.join('\n')}${more}`;
  }

  private extractFootballFixtures(text: string, query: string) {
    const normalizedText = text.replace(/\s+/g, ' ');
    const fixtures: FootballFixture[] = [];
    const seen = new Set<string>();
    const league = this.inferFootballLeague(query, text);
    const pattern = /([A-ZÀ-ỴA-Za-zĐđ][A-ZÀ-ỴA-Za-zĐđ0-9 .'-]{1,45}?)\s+(?:vs\.?|v\.?|gặp)\s+([A-ZÀ-ỴA-Za-zĐđ][A-ZÀ-ỴA-Za-zĐđ0-9 .'-]{1,45}?)(?:[^.;\n]{0,70}?)\s+(?:lúc|vao luc|vào lúc)\s*([0-2]?\d[:h][0-5]\d|[0-2]?\d\s*giờ)(?:\s*(?:ngày|rạng sáng|rang sang)\s*([0-3]?\d\/[01]?\d(?:\/\d{4})?))?/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(normalizedText)) !== null) {
      const left = this.normalizeFixtureTeamName(match[1]);
      const right = this.normalizeFixtureTeamName(match[2]);
      if (!left || !right) continue;

      const matchText = `${left} vs ${right}`;
      const time = this.cleanTime(match[3]);
      const date = match[4]?.trim();
      const key = this.normalizeVietnamese(`${time}|${date || ''}|${matchText}`);
      if (seen.has(key)) continue;
      seen.add(key);

      fixtures.push({ time, date, league, match: matchText });
    }

    return fixtures;
  }

  private normalizeFixtureTeamName(value: string) {
    const cleaned = this.cleanTeamName(value)
      .replace(/^.*\b(?:is|la)\s+/i, '')
      .replace(/^(and|va|và|trực tiếp|truc tiep|live|xem|nóng|nong|so tài|so tai|đối đầu|doi dau|lịch thi đấu|lich thi dau)\s+/i, '')
      .replace(/\s+(sẽ|se|are scheduled|is scheduled)$/i, '')
      .replace(/\s+(trong|tại|tai|ở|o|lúc|luc|vào|vao)\b.*$/i, '')
      .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return this.isValidFootballTeamName(cleaned) ? cleaned : '';
  }

  private isValidFootballTeamName(value: string) {
    if (/[\/\\]|https?:|www\.|[A-Za-z0-9_-]{7,}/.test(value)) return false;
    const normalized = this.normalizeVietnamese(value)
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length < 2) return false;
    if (/^\d/.test(normalized) || /\b\d{1,2}\s*(h|:)\s*\d{2}\b/.test(normalized)) return false;

    const exactRejects = new Set([
      'and',
      'va',
      'theo',
      'hom nay',
      'lich thi dau',
      'world cup',
      'bong da',
      'giai dau',
      'doi a',
      'doi b',
    ]);
    if (exactRejects.has(normalized)) return false;

    const phraseRejects = [
      'lich thi dau',
      'world cup',
      'hom nay',
      'truc tiep',
      'nguon',
      'theo ',
      'format',
      'scheduled',
    ];
    return !phraseRejects.some((phrase) => normalized.includes(phrase));
  }

  private cleanTeamName(value: string) {
    return value
      .replace(/^(trực tiếp|live|xem|nóng|so tài|đối đầu|lịch thi đấu)\s+/i, '')
      .replace(/\b(lúc|ngày|rạng sáng|vòng|bảng|trận|lịch|thi đấu)\b.*$/i, '')
      .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanTime(value: string) {
    return value
      .replace(/\s*giờ/i, ':00')
      .replace('h', ':')
      .replace(/^(\d):/, '0$1:')
      .trim();
  }

  private extractDateOnlyFootballFixtures(text: string, query: string, fullText: string, sourcePriority = 0) {
    const fixtures: FootballFixture[] = [];
    const pattern = /([^,.;|()\n-]{2,45}?)\s+(?:plays|play|face|faces|meet|meets|vs\.?|v\.?)\s+([^,.;|()\n-]{2,45}?)(?:\s+on\s+|\s*,?\s+)(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s+(\d{4})/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text || '')) !== null) {
      const left = this.normalizeFixtureTeamName(match[1]);
      const right = this.normalizeFixtureTeamName(match[2]);
      if (!left || !right) continue;

      fixtures.push({
        date: this.formatEnglishDate(match[3], match[4], match[5]),
        league: this.inferFootballLeague(query, `${text}\n${fullText}`),
        match: `${left} vs ${right}`,
        sourcePriority,
      });
    }

    return fixtures;
  }

  private formatEnglishDate(monthName: string, day: string, year: string) {
    const months: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    };
    const month = months[monthName.toLowerCase()];
    return month ? `${Number(day)}/${month}/${year}` : `${Number(day)}/${monthName}/${year}`;
  }

  private inferFootballLeague(query: string, text: string) {
    const combined = this.normalizeVietnamese(`${query}\n${text}`);
    if (combined.includes('world cup')) return 'World Cup 2026';
    if (combined.includes('champions league') || combined.includes(' c1')) return 'Champions League';
    if (combined.includes('premier league') || combined.includes('ngoai hang anh')) return 'Premier League';
    if (combined.includes('la liga')) return 'La Liga';
    if (combined.includes('serie a')) return 'Serie A';
    if (combined.includes('bundesliga')) return 'Bundesliga';
    return 'Bóng đá';
  }

  private keepScheduleOnly(answer: string) {
    const lines = answer
      .split(/\n|;/)
      .map((line) => line.replace(/^[-•\s]+/, '').trim())
      .filter((line) => /\b\d{1,2}[:h]\d{2}\b/.test(line) && /\bvs\.?\b/i.test(line))
      .map((line) => `- ${line}`);
    return lines.length ? `Lịch thi đấu:\n${lines.join('\n')}` : '';
  }

  private formatSourceLines(sources: FootballSource[], limit: number) {
    return sources
      .filter((source) => source?.url)
      .slice(0, limit)
      .map((source, index) => {
        const title = source?.title ? `${source.title}: ` : '';
        return `${index + 1}. ${title}${source.url}`;
      })
      .join('\n');
  }

  private normalizeVietnamese(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/\u0111/g, 'd')
      .replace(/\u0110/g, 'D')
      .toLowerCase();
  }
}
