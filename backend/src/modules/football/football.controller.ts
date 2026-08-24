import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FootballService } from './football.service';
import { getIctShiftedNow } from '../../utils/timezone.util';

@Controller('api/football')
@UseGuards(JwtAuthGuard)
export class FootballController {
  private readonly logger = new Logger(FootballController.name);

  constructor(private readonly footballService: FootballService) {}

  @Get('leagues')
  getLeagues() {
    return {
      leagues: this.footballService.getFreeLeagues(),
      notice: 'football-data.org free plan: lịch/kết quả có thể bị trễ; dữ liệu lineup/live event/thống kê/odds là best-effort nếu API trả về.',
    };
  }

  @Get('matches/today')
  async getTodayMatches() {
    const date = this.resolveTodayKey();
    const matches = await this.footballService.getTodayMatches(date);
    return {
      date,
      matches,
      notice: 'Dữ liệu hôm nay lấy từ free API, có thể không realtime.',
    };
  }

  @Get('matches')
  async getMatches(
    @Query('weekOffset') weekOffsetRaw?: string,
    @Query('league') league?: string,
  ) {
    const weekOffset = weekOffsetRaw ? Number.parseInt(weekOffsetRaw, 10) : 0;
    const { dateFrom, dateTo, weekLabel } = this.resolveWeekRange(Number.isFinite(weekOffset) ? weekOffset : 0);
    const normalizedLeague = league && league.toUpperCase() !== 'ALL' ? league : undefined;
    const matches = normalizedLeague
      ? await this.footballService.getMatchesForLeague(normalizedLeague, dateFrom, dateTo)
      : await this.footballService.getAllFreeMatches(dateFrom, dateTo);

    let europaLeagueSummary: string | null = null;
    if (!normalizedLeague) {
      try {
        europaLeagueSummary = await this.footballService.getEuropaLeagueSummary(weekLabel);
      } catch (error: any) {
        this.logger.warn(`Failed to fetch Europa League summary: ${error.message}`);
      }
    }

    return {
      weekLabel,
      dateFrom,
      dateTo,
      league: normalizedLeague || null,
      matches,
      europaLeagueSummary,
      notice: 'Lịch/kết quả free API có thể bị trễ; chi tiết live chuyên sâu không được đảm bảo.',
    };
  }

  @Get('standings')
  async getStandings(@Query('league') league = 'PL') {
    return {
      league,
      standings: await this.footballService.getStandings(league),
    };
  }

  @Get('teams')
  async getTeams(@Query('league') league = 'PL') {
    return {
      league,
      teams: await this.footballService.getTeams(league),
      notice: 'Squad/player sâu là best-effort: free API có thể không trả đầy đủ.',
    };
  }

  @Get('teams/:id/matches')
  async getTeamMatches(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 10;
    return {
      teamId: Number.parseInt(id, 10),
      status: status || 'SCHEDULED',
      matches: await this.footballService.getTeamMatches(Number.parseInt(id, 10), status, Number.isFinite(limit) ? limit : 10),
    };
  }

  @Get('matches/:id')
  async getMatchDetail(@Param('id') id: string) {
    return this.footballService.getMatchDetail(Number.parseInt(id, 10));
  }

  /** Monday..Sunday range (ICT) for "the week weekOffset weeks from this one". */
  private resolveWeekRange(weekOffset: number) {
    const now = getIctShiftedNow();
    const currentWeekday = now.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = currentWeekday === 0 ? -6 : 1 - currentWeekday;

    const monday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + diffToMonday + weekOffset * 7,
    ));
    const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));

    const toKey = (d: Date) => d.toISOString().split('T')[0];
    const toDisplay = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

    return {
      dateFrom: toKey(monday),
      dateTo: toKey(sunday),
      weekLabel: `${toDisplay(monday)} - ${toDisplay(sunday)}`,
    };
  }

  private resolveTodayKey() {
    return getIctShiftedNow().toISOString().split('T')[0];
  }
}
