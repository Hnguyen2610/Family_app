import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FootballScheduleSearchHelper } from '../ai-agent/helpers/football-schedule-search.helper';

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
};

@Injectable()
export class FootballService {
  private readonly logger = new Logger(FootballService.name);
  private readonly apiKey = process.env.FOOTBALL_DATA_API_KEY;
  private readonly baseUrl = 'https://api.football-data.org/v4';
  private readonly cache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly matchDetailCache = new Map<string, { expiresAt: number; detail: FootballMatchDetail }>();
  private readonly standingsCache = new Map<string, { expiresAt: number; standings: FootballStandingGroup[] }>();
  private readonly teamsCache = new Map<string, { expiresAt: number; teams: FootballTeam[] }>();
  private readonly teamMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly todayMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
  private readonly allMatchesCache = new Map<string, { expiresAt: number; matches: FootballMatch[] }>();
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
    const cacheKey = `${code}:${dateFrom}:${dateTo}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) throw new Error('API Key missing');

    const url = `${this.baseUrl}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const response = await fetch(url, { headers: { 'X-Auth-Token': this.apiKey } });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
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

    if (!this.apiKey) throw new Error('API Key missing');

    const response = await fetch(`${this.baseUrl}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const allowedCodes = new Set(this.freeLeagues.map((league) => league.code));
    const matches = this.mapMatches(data.matches || [])
      .filter((match) => !match.competitionCode || allowedCodes.has(match.competitionCode));

    matches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    this.allMatchesCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, matches });
    return matches;
  }

  async getTodayMatches(dateKey: string): Promise<FootballMatch[]> {
    const cacheKey = `today:${dateKey}`;
    const cached = this.todayMatchesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.matches;

    if (!this.apiKey) throw new Error('API Key missing');

    const response = await fetch(`${this.baseUrl}/matches?dateFrom=${dateKey}&dateTo=${dateKey}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as any;
      throw new Error(err.message || 'API Error');
    }

    const data = (await response.json()) as any;
    const allowedCodes = new Set(this.freeLeagues.map((league) => league.code));
    const matches = this.mapMatches(data.matches || [])
      .filter((match) => !match.competitionCode || allowedCodes.has(match.competitionCode));

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
    };

    this.matchDetailCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, detail });
    return detail;
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
