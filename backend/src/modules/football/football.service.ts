import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FootballScheduleSearchHelper } from '../ai-agent/helpers/football-schedule-search.helper';
import { resolveVietnamTeam } from './vietnam-football-directory';

export type FootballMatch = {
  id: number;
  utcDate: string;
  competitionCode: string | null;
  competitionName: string;
  competitionEmblem: string | null;
  homeTeam: string;
  homeTeamCrest: string | null;
  awayTeam: string;
  awayTeamCrest: string | null;
  status: string;
  detailAvailable?: boolean;
  matchday?: number | null;
  stage?: string | null;
  group?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
};

export type FootballLeague = {
  code: string;
  name: string;
  area: string;
};

export type FootballStandingRow = {
  position: number;
  team: { id: number; name: string; crest: string | null };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form: string | null;
};

export type FootballStandingGroup = {
  stage: string | null;
  type: string | null;
  group: string | null;
  table: FootballStandingRow[];
};

export type FootballTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  venue: string | null;
  founded: number | null;
  clubColors: string | null;
  website: string | null;
  squad?: Array<{
    id: number;
    name: string;
    position: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
  }>;
};

type FootballDeepFieldKey = 'events' | 'goals' | 'cards' | 'substitutions' | 'lineups' | 'statistics';

export type FootballMatchEnrichmentSource = {
  title: string;
  url: string;
};

export type FootballMatchEnrichmentField = {
  provider: 'tavily';
  status: 'filled' | 'missing';
  summary: string | null;
  sources: FootballMatchEnrichmentSource[];
};

export type FootballMatchEnrichment = {
  provider: 'tavily';
  attemptedFields: FootballDeepFieldKey[];
  filledFields: FootballDeepFieldKey[];
  fields: Partial<Record<FootballDeepFieldKey, FootballMatchEnrichmentField>>;
  notice: string;
};

export type FootballMatchDetail = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string | null;
  group: string | null;
  venue: string | null;
  competitionName: string;
  competitionEmblem: string | null;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  referees: string[];
  score: {
    winner: string | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  deepDataNotice: string;
  deepData: {
    goals: unknown[];
    cards: unknown[];
    substitutions: unknown[];
    lineups: unknown[];
    statistics: unknown[];
    odds: unknown[];
    rawEvents: unknown[];
    rawAvailableKeys: string[];
  };
  enrichment: FootballMatchEnrichment | null;
};

@Injectable()
export class FootballService {
  private readonly logger = new Logger(FootballService.name);
  private readonly apiKey = process.env.FOOTBALL_DATA_API_KEY;
  private readonly baseUrl = 'https://api.football-data.org/v4';
  private readonly cache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly matchDetailCache = new Map<string, { expiresAt: number; detail: FootballMatchDetail }>();
  private readonly matchEnrichmentCache = new Map<string, { expiresAt: number; enrichment: FootballMatchEnrichment | null }>();
  private readonly standingsCache = new Map<string, { expiresAt: number; standings: FootballStandingGroup[] }>();
  private readonly teamsCache = new Map<string, { expiresAt: number; teams: FootballTeam[] }>();
  private readonly teamMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly todayMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly allMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly vietnamMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly europaLeagueCache = new Map<string, { expiresAt: number; summary: string }>();
  private readonly cacheTtlMs = 10 * 60 * 1000;

  readonly freeLeagues: FootballLeague[] = [
    { code: 'PL', name: 'Premier League', area: 'England' },
    { code: 'PD', name: 'La Liga', area: 'Spain' },
    { code: 'BL1', name: 'Bundesliga', area: 'Germany' },
    { code: 'SA', name: 'Serie A', area: 'Italy' },
    { code: 'FL1', name: 'Ligue 1', area: 'France' },
    { code: 'DED', name: 'Eredivisie', area: 'Netherlands' },
    { code: 'PPL', name: 'Primeira Liga', area: 'Portugal' },
    { code: 'ELC', name: 'Championship', area: 'England' },
    { code: 'BSA', name: 'Campeonato Brasileiro Serie A', area: 'Brazil' },
    { code: 'CL', name: 'Champions League', area: 'Europe' },
    { code: 'WC', name: 'FIFA World Cup', area: 'World' },
    { code: 'EC', name: 'European Championship', area: 'Europe' },
    { code: 'VLEAGUE', name: 'V-League 1', area: 'Việt Nam' },
    { code: 'VIETNAM', name: 'Đội tuyển Việt Nam', area: 'Việt Nam' },
  ];

  // Keep the legacy multi-league schedule narrow. The UI uses single-league calls to stay under
  // football-data.org's free 10 calls/minute limit.
  readonly defaultLeagues = ['PL', 'PD', 'BL1', 'SA', 'CL', 'FL1', 'WC', 'EC'];

  private readonly tavilyApiKey = process.env.TAVILY_API_KEY;
  private readonly footballScheduleHelper = new FootballScheduleSearchHelper();

  getFreeLeagues(): FootballLeague[] {
    return this.freeLeagues;
  }

  async getMatchesForLeague(leagueCode: string, dateFrom: string, dateTo: string): Promise<FootballMatch[]> {
    const code = this.normalizeLeagueCode(leagueCode);
    if (this.isVietnamLeagueCode(code)) {
      return this.getVietnamFootballMatches(code, dateFrom, dateTo);
    }

    const cacheKey = `${code}:${dateFrom}:${dateTo}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) {
      this.logger.warn('FOOTBALL_DATA_API_KEY missing; returning cached or empty football matches.');
      return cached?.matches || [];
    }

    const url = `${this.baseUrl}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const response = await fetch(url, { headers: { 'X-Auth-Token': this.apiKey } });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      if (cached) {
        this.logger.warn(`Football API failed for ${code}; returning stale cache: ${err.message || response.status}`);
        return cached.matches;
      }
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const matches = this.mapMatches(data.matches || []);

    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, matches });
    return matches;
  }

  async getMatches(leagueCodes: string[], dateFrom: string, dateTo: string): Promise<FootballMatch[]> {
    const results = await Promise.allSettled(
      leagueCodes.map((code) => this.getMatchesForLeague(code, dateFrom, dateTo)),
    );

    const matches: FootballMatch[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        matches.push(...result.value);
      } else {
        this.logger.warn(`Failed to fetch football matches for a league: ${result.reason?.message || result.reason}`);
      }
    }

    matches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    return matches;
  }

  async getAllFreeMatches(dateFrom: string, dateTo: string): Promise<FootballMatch[]> {
    const cacheKey = `all:${dateFrom}:${dateTo}`;
    const cached = this.allMatchesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) {
      this.logger.warn('FOOTBALL_DATA_API_KEY missing; returning cached or Vietnam-only all-football matches.');
      return cached?.matches || this.getAllVietnamFootballMatches(dateFrom, dateTo);
    }

    const response = await fetch(`${this.baseUrl}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      if (cached) {
        this.logger.warn(`Football API failed for all matches; returning stale cache: ${err.message || response.status}`);
        return cached.matches;
      }
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const allowedCodes = new Set(this.freeLeagues.map((league) => league.code).filter((code) => !this.isVietnamLeagueCode(code)));
    const apiMatches = this.mapMatches(data.matches || [])
      .filter((match) => !match.competitionCode || allowedCodes.has(match.competitionCode));
    const vietnamMatches = await this.getAllVietnamFootballMatches(dateFrom, dateTo);
    const matches = this.sortMatchesByNotability([...apiMatches, ...vietnamMatches]);
    this.allMatchesCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, matches });
    return matches;
  }

  async getTodayMatches(dateKey: string): Promise<FootballMatch[]> {
    const cacheKey = `today:${dateKey}`;
    const cached = this.todayMatchesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) {
      this.logger.warn('FOOTBALL_DATA_API_KEY missing; returning cached or Vietnam-only today football matches.');
      return cached?.matches || this.getAllVietnamFootballMatches(dateKey, dateKey);
    }

    const response = await fetch(`${this.baseUrl}/matches?dateFrom=${dateKey}&dateTo=${dateKey}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      if (cached) {
        this.logger.warn(`Football API failed for today matches; returning stale cache: ${err.message || response.status}`);
        return cached.matches;
      }
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const allowedCodes = new Set(this.freeLeagues.map((league) => league.code).filter((code) => !this.isVietnamLeagueCode(code)));
    const apiMatches = this.mapMatches(data.matches || [])
      .filter((match) => !match.competitionCode || allowedCodes.has(match.competitionCode));
    const vietnamMatches = await this.getAllVietnamFootballMatches(dateKey, dateKey);
    const matches = this.sortMatchesByNotability([...apiMatches, ...vietnamMatches]);

    this.todayMatchesCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, matches });
    return matches;
  }

  async getStandings(leagueCode: string): Promise<FootballStandingGroup[]> {
    const code = this.normalizeLeagueCode(leagueCode);
    const cached = this.standingsCache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.standings;

    if (!this.apiKey) throw new Error('API Key missing');

    const response = await fetch(`${this.baseUrl}/competitions/${code}/standings`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const standings: FootballStandingGroup[] = (data.standings || []).map((standing: any) => ({
      stage: standing.stage ?? null,
      type: standing.type ?? null,
      group: standing.group ?? null,
      table: (standing.table || []).map((row: any) => ({
        position: row.position,
        team: {
          id: row.team?.id,
          name: row.team?.name,
          crest: row.team?.crest ?? null,
        },
        playedGames: row.playedGames ?? 0,
        won: row.won ?? 0,
        draw: row.draw ?? 0,
        lost: row.lost ?? 0,
        points: row.points ?? 0,
        goalsFor: row.goalsFor ?? 0,
        goalsAgainst: row.goalsAgainst ?? 0,
        goalDifference: row.goalDifference ?? 0,
        form: row.form ?? null,
      })),
    }));

    this.standingsCache.set(code, { expiresAt: Date.now() + this.cacheTtlMs, standings });
    return standings;
  }

  async getTeams(leagueCode: string): Promise<FootballTeam[]> {
    const code = this.normalizeLeagueCode(leagueCode);
    const cached = this.teamsCache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.teams;

    if (!this.apiKey) throw new Error('API Key missing');

    const response = await fetch(`${this.baseUrl}/competitions/${code}/teams`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const teams: FootballTeam[] = (data.teams || []).map((team: any) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName ?? null,
      tla: team.tla ?? null,
      crest: team.crest ?? null,
      venue: team.venue ?? null,
      founded: team.founded ?? null,
      clubColors: team.clubColors ?? null,
      website: team.website ?? null,
      squad: Array.isArray(team.squad)
        ? team.squad.map((player: any) => ({
            id: player.id,
            name: player.name,
            position: player.position ?? null,
            dateOfBirth: player.dateOfBirth ?? null,
            nationality: player.nationality ?? null,
          }))
        : undefined,
    }));

    this.teamsCache.set(code, { expiresAt: Date.now() + this.cacheTtlMs, teams });
    return teams;
  }

  async getTeamMatches(teamId: number, status?: string, limit = 10): Promise<FootballMatch[]> {
    const normalizedStatus = status ? status.toUpperCase() : 'SCHEDULED';
    const safeLimit = Math.min(Math.max(limit ?? 10, 1), 20);
    const cacheKey = `team:${teamId}:${normalizedStatus}:${safeLimit}`;
    const cached = this.teamMatchesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) throw new Error('API Key missing');

    const params = new URLSearchParams({ status: normalizedStatus, limit: String(safeLimit) });
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/matches?${params.toString()}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const matches = this.mapMatches(data.matches || []);
    this.teamMatchesCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, matches });
    return matches;
  }

  async getEuropaLeagueSummary(weekLabel: string): Promise<string> {
    const cached = this.europaLeagueCache.get(weekLabel);
    if (cached && cached.expiresAt > Date.now()) return cached.summary;
    if (!this.tavilyApiKey) throw new Error('TAVILY_API_KEY missing');

    const query = `Lịch thi đấu Europa League tuần ${weekLabel} theo giờ Việt Nam`;
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.tavilyApiKey}` },
      body: JSON.stringify({ query, include_answer: true, max_results: 5, search_depth: 'basic' }),
    });
    if (!response.ok) throw new Error(`Tavily API returned ${response.status}`);

    const data = (await response.json().catch(() => ({}))) as any;
    const sources = (data.results || []).slice(0, 5).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      rawContent: r.raw_content,
    }));
    const summary = this.footballScheduleHelper.formatScheduleResult(query, data.answer || '', sources);

    this.europaLeagueCache.set(weekLabel, { expiresAt: Date.now() + this.cacheTtlMs, summary });
    return summary;
  }

  async getMatchDetail(matchId: number): Promise<FootballMatchDetail> {
    const cacheKey = `detail:${matchId}`;
    const cached = this.matchDetailCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.detail;

    if (!this.apiKey) throw new Error('API Key missing');

    const response = await fetch(`${this.baseUrl}/matches/${matchId}`, { headers: { 'X-Auth-Token': this.apiKey } });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }
    const data = (await response.json()) as any;
    const rawEvents = this.pickArray(data.events, data.timeline, data.incidents);
    const goals = rawEvents.filter((event: any) => /goal/i.test(`${event.type || event.kind || event.detail || ''}`));
    const cards = rawEvents.filter((event: any) => /card|yellow|red/i.test(`${event.type || event.kind || event.detail || ''}`));
    const substitutions = rawEvents.filter((event: any) => /substitution|sub/i.test(`${event.type || event.kind || event.detail || ''}`));

    const detail: FootballMatchDetail = {
      id: data.id,
      utcDate: data.utcDate,
      status: data.status,
      matchday: data.matchday ?? null,
      stage: data.stage ?? null,
      group: data.group ?? null,
      venue: data.venue ?? null,
      competitionName: data.competition?.name || 'Bóng đá',
      competitionEmblem: data.competition?.emblem ?? null,
      homeTeam: { name: data.homeTeam?.name, crest: data.homeTeam?.crest ?? null },
      awayTeam: { name: data.awayTeam?.name, crest: data.awayTeam?.crest ?? null },
      referees: (data.referees || []).map((r: any) => r.name).filter(Boolean),
      score: {
        winner: data.score?.winner ?? null,
        fullTime: { home: data.score?.fullTime?.home ?? null, away: data.score?.fullTime?.away ?? null },
        halfTime: { home: data.score?.halfTime?.home ?? null, away: data.score?.halfTime?.away ?? null },
      },
      deepDataNotice: 'Dữ liệu live/lineup/sự kiện/thống kê/odds là best-effort: gói free có thể không trả, trả thiếu hoặc trả trễ.',
      deepData: {
        goals,
        cards,
        substitutions,
        lineups: this.pickArray(data.lineups, data.homeLineup, data.awayLineup),
        statistics: this.pickArray(data.statistics, data.stats),
        odds: this.pickArray(data.odds),
        rawEvents,
        rawAvailableKeys: Object.keys(data).sort(),
      },
      enrichment: null,
    };

    const missingFields = this.getMissingDeepFields(detail.deepData);
    detail.enrichment = await this.enrichMissingMatchFields(detail, missingFields).catch((error) => {
      this.logger.warn(`Tavily football enrichment failed for match ${matchId}: ${error?.message || error}`);
      return null;
    });

    this.matchDetailCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, detail });
    return detail;
  }

  private getMissingDeepFields(deepData: FootballMatchDetail['deepData']): FootballDeepFieldKey[] {
    const checks: Array<[FootballDeepFieldKey, unknown[]]> = [
      ['events', deepData.rawEvents],
      ['goals', deepData.goals],
      ['cards', deepData.cards],
      ['substitutions', deepData.substitutions],
      ['lineups', deepData.lineups],
      ['statistics', deepData.statistics],
    ];
    return checks.filter(([, value]) => !Array.isArray(value) || value.length === 0).map(([field]) => field);
  }

  private async enrichMissingMatchFields(
    detail: FootballMatchDetail,
    missingFields: FootballDeepFieldKey[],
  ): Promise<FootballMatchEnrichment | null> {
    if (missingFields.length === 0) return null;
    if (!this.tavilyApiKey) {
      this.logger.warn('TAVILY_API_KEY missing; skipping football match enrichment.');
      return null;
    }

    const cacheKey = `enrich:${detail.id}:${missingFields.join(',')}`;
    const cached = this.matchEnrichmentCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.enrichment;

    const query = this.buildMatchEnrichmentQuery(detail, missingFields);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.tavilyApiKey}` },
      body: JSON.stringify({
        query,
        include_answer: false,
        include_raw_content: true,
        max_results: 5,
        search_depth: 'advanced',
      }),
    });
    if (!response.ok) throw new Error(`Tavily API returned ${response.status}`);

    const data = (await response.json().catch(() => ({}))) as any;
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const sources = rawResults
      .slice(0, 5)
      .map((result: any) => ({
        title: String(result.title || result.url || 'Source').slice(0, 140),
        url: String(result.url || ''),
      }))
      .filter((source: FootballMatchEnrichmentSource) => source.url);
    const searchableText = rawResults
      .map((result: any) => `${result.title || ''}\n${result.content || ''}\n${result.raw_content || ''}`)
      .join('\n');

    const fields: FootballMatchEnrichment['fields'] = {};
    const filledFields: FootballDeepFieldKey[] = [];
    for (const field of missingFields) {
      const summary = this.extractEnrichmentSummary(field, searchableText);
      const filled = Boolean(summary);
      fields[field] = {
        provider: 'tavily',
        status: filled ? 'filled' : 'missing',
        summary,
        sources,
      };
      if (filled) filledFields.push(field);
    }

    const enrichment: FootballMatchEnrichment = {
      provider: 'tavily',
      attemptedFields: missingFields,
      filledFields,
      fields,
      notice: 'Tavily chỉ bổ sung các trường provider không trả về; dữ liệu web là best-effort và không ghi đè dữ liệu API.',
    };
    const ttl = detail.status === 'FINISHED' ? 6 * 60 * 60 * 1000 : this.cacheTtlMs;
    this.matchEnrichmentCache.set(cacheKey, { expiresAt: Date.now() + ttl, enrichment });
    return enrichment;
  }

  private buildMatchEnrichmentQuery(detail: FootballMatchDetail, missingFields: FootballDeepFieldKey[]) {
    const date = detail.utcDate ? detail.utcDate.slice(0, 10) : '';
    const fieldTerms = missingFields.map((field) => this.getEnrichmentSearchTerms(field)).join(', ');
    return `${detail.homeTeam.name} vs ${detail.awayTeam.name} ${detail.competitionName} ${date} match report ${fieldTerms}`;
  }

  private getEnrichmentSearchTerms(field: FootballDeepFieldKey) {
    const terms: Record<FootballDeepFieldKey, string> = {
      events: 'goals cards substitutions match events',
      goals: 'goal scorers assists',
      cards: 'yellow cards red cards bookings',
      substitutions: 'substitutions players replaced',
      lineups: 'starting lineups formations substitutes',
      statistics: 'possession shots corners fouls match statistics',
    };
    return terms[field];
  }

  private extractEnrichmentSummary(field: FootballDeepFieldKey, text: string) {
    const lines = this.toEnrichmentCandidateLines(text);
    const patterns = this.getEnrichmentPatterns(field);
    const matches = lines.filter((line) => (
      patterns.some((pattern) => pattern.test(line)) &&
      this.isSpecificEnrichmentLine(field, line) &&
      !this.isNegatedEnrichmentLine(field, line)
    ));
    const unique = Array.from(new Set(matches.map((line) => line.replace(/\s+/g, ' ').trim())));
    return unique.length ? unique.slice(0, 12).join('\n') : null;
  }

  private toEnrichmentCandidateLines(text: string) {
    return text
      .replace(/\r/g, '\n')
      .split(/\n+|[.!?]\s+/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 8 && line.length <= 320);
  }

  private getEnrichmentPatterns(field: FootballDeepFieldKey) {
    const patterns: Record<FootballDeepFieldKey, RegExp[]> = {
      events: [/\b(goal!|yellow card|red card|substitution|replaces|booked|sent off)\b/i],
      goals: [/\bgoal!?\b/i, /\b(scored|scores|equaliser|equalizer|winner|headed home|assist(?:ed)? by)\b/i],
      cards: [/\b(yellow card|red card|booking|booked|sent off|dismissed)\b/i],
      substitutions: [/\b(substitution|substituted|replaces|replaced|came on|off the bench)\b/i],
      lineups: [/\b(starting lineups?|starting xi|starting 11|lineup:|formation|substitutes:)\b/i],
      statistics: [/\b(possession|shots? on target|shots?|corners?|passes?|pass accuracy|fouls|offsides|saves|xg)\b/i],
    };
    return patterns[field];
  }

  private isSpecificEnrichmentLine(field: FootballDeepFieldKey, line: string) {
    const lower = line.toLowerCase();
    if (/live stats h2h|video summary|rounds standings|analysis preview|lineups events news/.test(lower)) return false;
    if (field === 'statistics') return /(\d|%)/.test(line);
    if (field === 'lineups') return /\b(starting lineups?|starting xi|starting 11|lineup:|formation|substitutes:)\b/i.test(line);
    return true;
  }

  private isNegatedEnrichmentLine(field: FootballDeepFieldKey, line: string) {
    const lower = line.toLowerCase();
    if (field === 'cards' || field === 'events') {
      return /\b(no|without)\b.{0,40}\b(yellow|red|cards?|bookings?)\b/.test(lower);
    }
    if (field === 'goals') {
      return /\b(no goals?|goalless|scoreless)\b/.test(lower);
    }
    return false;
  }

  private isVietnamLeagueCode(code: string) {
    return code === 'VLEAGUE' || code === 'VIETNAM';
  }

  private readonly competitionPriorityTiers: string[][] = [
    ['CL', 'WC', 'EC'],
    ['VLEAGUE', 'VIETNAM'],
    ['PL', 'PD', 'BL1', 'SA', 'FL1'],
  ];

  private getCompetitionPriority(code: string | null): number {
    if (!code) return this.competitionPriorityTiers.length;
    const tierIndex = this.competitionPriorityTiers.findIndex((tier) => tier.includes(code));
    return tierIndex === -1 ? this.competitionPriorityTiers.length : tierIndex;
  }

  private sortMatchesByNotability(matches: FootballMatch[]): FootballMatch[] {
    return [...matches].sort((a, b) => {
      const priorityDiff = this.getCompetitionPriority(a.competitionCode) - this.getCompetitionPriority(b.competitionCode);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime();
    });
  }

  private async getAllVietnamFootballMatches(dateFrom: string, dateTo: string) {
    const results = await Promise.allSettled([
      this.getVietnamFootballMatches('VLEAGUE', dateFrom, dateTo),
      this.getVietnamFootballMatches('VIETNAM', dateFrom, dateTo),
    ]);
    const matches = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return this.dedupeMatches(matches);
  }

  private async getVietnamFootballMatches(code: 'VLEAGUE' | 'VIETNAM', dateFrom: string, dateTo: string): Promise<FootballMatch[]> {
    const cacheKey = `vietnam:${code}:${dateFrom}:${dateTo}`;
    const cached = this.vietnamMatchesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.tavilyApiKey) {
      this.logger.warn(`TAVILY_API_KEY missing; returning cached or empty ${code} matches.`);
      return cached?.matches || [];
    }

    const query = code === 'VLEAGUE'
      ? `lịch thi đấu V-League từ ${dateFrom} đến ${dateTo}`
      : `lịch thi đấu đội tuyển Việt Nam từ ${dateFrom} đến ${dateTo}`;
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.tavilyApiKey}` },
      body: JSON.stringify({
        query,
        include_answer: false,
        include_raw_content: true,
        max_results: 5,
        search_depth: 'basic',
      }),
    });
    if (!response.ok) {
      if (cached) return cached.matches;
      throw new Error(`Tavily API returned ${response.status}`);
    }

    const data = (await response.json().catch(() => ({}))) as any;
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const matches = this.dedupeMatches(
      rawResults.flatMap((result: any) => this.extractVietnamMatchesFromText(
        `${result.title || ''}\n${result.content || ''}\n${result.raw_content || ''}`,
        code,
        dateFrom,
        dateTo,
      )),
    ).sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

    this.vietnamMatchesCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, matches });
    return matches;
  }

  private extractVietnamMatchesFromText(
    text: string,
    code: 'VLEAGUE' | 'VIETNAM',
    dateFrom: string,
    dateTo: string,
  ): FootballMatch[] {
    const lines = text
      .replace(/\r/g, '\n')
      .split(/\n+|[;|]/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 12 && line.length <= 260);
    const matches: FootballMatch[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const context = [lines[index - 2], lines[index - 1], lines[index]].filter(Boolean).join(' ');
      const parsed = this.parseVietnamScheduleLine(context, code, dateFrom, dateTo);
      if (parsed) matches.push(parsed);
    }

    return this.dedupeMatches(matches);
  }

  private parseVietnamScheduleLine(
    line: string,
    code: 'VLEAGUE' | 'VIETNAM',
    dateFrom: string,
    dateTo: string,
  ): FootballMatch | null {
    if (!this.isLikelyVietnamScheduleLine(line, code)) return null;

    const parsedDate = this.parseVietnamMatchDate(line, dateFrom, dateTo);
    if (!parsedDate) return null;

    const teams = this.parseMatchTeams(line);
    if (!teams) return null;

    const home = resolveVietnamTeam(teams.home, code);
    const away = resolveVietnamTeam(teams.away, code);

    const utcDate = this.buildVietnamMatchUtcDate(parsedDate.dateKey, parsedDate.time);
    return {
      id: -Math.abs(this.hashMatchId(`${code}:${utcDate}:${home.name}:${away.name}`)),
      utcDate,
      competitionCode: code,
      competitionName: code === 'VLEAGUE' ? 'V-League 1' : 'Đội tuyển Việt Nam',
      competitionEmblem: null,
      homeTeam: home.name,
      homeTeamCrest: home.crestUrl,
      awayTeam: away.name,
      awayTeamCrest: away.crestUrl,
      status: 'TIMED',
      detailAvailable: false,
      matchday: null,
      stage: null,
      group: null,
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
    };
  }

  private isLikelyVietnamScheduleLine(line: string, code: 'VLEAGUE' | 'VIETNAM') {
    const normalized = line.toLowerCase();
    if (!/(vs| v |đấu với|gặp| - | – )/i.test(line)) return false;
    if (code === 'VIETNAM') return /việt nam|vietnam|u23|u22|đội tuyển/.test(normalized);
    return /v-league|vleague|v\.league|vô địch quốc gia|công an hà nội|hà nội|hoàng anh gia lai|thép xanh nam định|nam định|thể công|viettel|sông lam nghệ an|bình dương|thanh hóa|hải phòng|đà nẵng|quảng nam|bình định|phù đổng|ninh bình|tp\.? hcm|hồ chí minh/i.test(line);
  }

  private parseVietnamMatchDate(line: string, dateFrom: string, dateTo: string) {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    const year = Number.parseInt(dateFrom.slice(0, 4), 10);
    const iso = line.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    const dmy = line.match(/\b(?:ngày\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/i);
    const timeMatch = line.match(/\b(\d{1,2})[:h](\d{2})\b/i);
    const time = timeMatch
      ? { hour: Math.min(23, Number.parseInt(timeMatch[1], 10)), minute: Math.min(59, Number.parseInt(timeMatch[2], 10)) }
      : { hour: 19, minute: 0 };

    let date: Date | null = null;
    if (iso) {
      date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    } else if (dmy) {
      date = new Date(Date.UTC(Number(dmy[3] || year), Number(dmy[2]) - 1, Number(dmy[1])));
    }
    if (!date || Number.isNaN(date.getTime()) || date < from || date > to) return null;

    return { dateKey: date.toISOString().slice(0, 10), time };
  }

  private buildVietnamMatchUtcDate(dateKey: string, time: { hour: number; minute: number }) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, time.hour - 7, time.minute)).toISOString();
  }

  private parseMatchTeams(line: string) {
    const cleaned = line
      .replace(/\b(?:ngày\s*)?\d{1,2}[/-]\d{1,2}(?:[/-]20\d{2})?\b/gi, ' ')
      .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
      .replace(/\b\d{1,2}[:h]\d{2}\b/gi, ' ')
      .replace(/\b(vòng|round)\s+\d+\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const match = cleaned.match(/(.{2,80}?)\s+(?:vs|v|đấu với|gặp|[-–])\s+(.{2,80})/i);
    if (!match) return null;
    const home = this.cleanTeamName(match[1]);
    const away = this.cleanTeamName(match[2]);
    if (!home || !away || home === away) return null;
    if (!this.isPlausibleTeamName(home) || !this.isPlausibleTeamName(away)) return null;
    return { home, away };
  }

  private isPlausibleTeamName(name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return false;

    const lower = trimmed.toLowerCase();
    if (lower.includes('data:image') || lower.includes('base64') || lower.includes('http://') || lower.includes('https://')) {
      return false;
    }

    const tokens = trimmed.split(/\s+/);
    return tokens.every((token) => token.length <= 24 && /\p{L}/u.test(token));
  }

  private cleanTeamName(value: string) {
    return value
      .replace(/\b(lịch thi đấu|trực tiếp|link xem|nhận định|soi kèo|kết quả|highlights?)\b/gi, ' ')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[-–:,\s]+|[-–:,\s]+$/g, '')
      .slice(0, 80)
      .trim();
  }

  private dedupeMatches(matches: FootballMatch[]) {
    const byKey = new Map<string, FootballMatch>();
    for (const match of matches) {
      const key = `${match.competitionCode}:${match.utcDate}:${match.homeTeam.toLowerCase()}:${match.awayTeam.toLowerCase()}`;
      if (!byKey.has(key)) byKey.set(key, match);
    }
    return [...byKey.values()];
  }

  private hashMatchId(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return hash || 1;
  }

  private normalizeLeagueCode(leagueCode: string) {
    const code = (leagueCode || '').toUpperCase().trim();
    if (!this.freeLeagues.some((league) => league.code === code)) {
      throw new BadRequestException(`Unsupported free football league: ${leagueCode}`);
    }
    return code;
  }

  private mapMatches(matches: any[]): FootballMatch[] {
    return (matches || []).map((m: any) => ({
      id: m.id,
      utcDate: m.utcDate,
      competitionCode: m.competition?.code ?? null,
      competitionName: m.competition?.name || 'Bóng đá',
      competitionEmblem: m.competition?.emblem ?? null,
      homeTeam: m.homeTeam?.name,
      homeTeamCrest: m.homeTeam?.crest ?? null,
      awayTeam: m.awayTeam?.name,
      awayTeamCrest: m.awayTeam?.crest ?? null,
      status: m.status,
      matchday: m.matchday ?? null,
      stage: m.stage ?? null,
      group: m.group ?? null,
      homeScore: m.score?.fullTime?.home,
      awayScore: m.score?.fullTime?.away,
      homePenalties: m.score?.penalties?.home,
      awayPenalties: m.score?.penalties?.away,
    }));
  }

  private pickArray(...values: unknown[]) {
    const picked: unknown[] = [];
    for (const value of values) {
      if (Array.isArray(value)) {
        picked.push(...value);
      } else if (value && typeof value === 'object') {
        picked.push(value);
      }
    }
    return picked;
  }
}
