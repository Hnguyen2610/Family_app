'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiAlertCircle,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiClock,
  FiList,
  FiRefreshCw,
  FiShield,
  FiTable,
  FiUsers,
} from 'react-icons/fi';
import {
  footballAPI,
  type FootballLeague,
  type FootballMatch,
  type FootballStandingGroup,
  type FootballTeam,
} from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { useAsync } from '@/hooks/useAsync';
import { getDateLocale } from '@/utils/date';
import { cachedFootballRequest } from '@/lib/football-cache';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FootballView = 'today' | 'schedule' | 'standings' | 'teams';

const ALL_LEAGUES = 'ALL';
const VIETNAM_LEAGUE_CODES = new Set(['VLEAGUE', 'VIETNAM']);

const STATUS_LABEL: Record<string, { vi: string; en: string }> = {
  FINISHED: { vi: 'Đã kết thúc', en: 'Finished' },
  LIVE: { vi: 'Đang đá', en: 'Live' },
  IN_PLAY: { vi: 'Đang đá', en: 'Live' },
  PAUSED: { vi: 'Nghỉ giữa hiệp', en: 'Paused' },
  SCHEDULED: { vi: 'Sắp diễn ra', en: 'Scheduled' },
  TIMED: { vi: 'Sắp diễn ra', en: 'Scheduled' },
  POSTPONED: { vi: 'Hoãn', en: 'Postponed' },
  CANCELLED: { vi: 'Hủy', en: 'Cancelled' },
};

const FALLBACK_LEAGUES: FootballLeague[] = [
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

const VIEW_META: Record<FootballView, { icon: ComponentType<{ className?: string }>; vi: string; en: string }> = {
  today: { icon: FiClock, vi: 'Hôm nay', en: 'Today' },
  schedule: { icon: FiList, vi: 'Lịch tuần', en: 'Week' },
  standings: { icon: FiTable, vi: 'BXH', en: 'Table' },
  teams: { icon: FiUsers, vi: 'Đội bóng', en: 'Teams' },
};

function formatMatchTime(utcDate: string, language: string) {
  const date = new Date(utcDate);
  const locale = getDateLocale(language);
  return {
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
    day: date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
  };
}

function scoreText(match: FootballMatch) {
  const hasScore = match.homeScore !== undefined && match.homeScore !== null;
  if (!hasScore) return null;
  const base = `${match.homeScore} - ${match.awayScore ?? 0}`;
  const hasPenalties = match.homePenalties !== undefined && match.homePenalties !== null
    && match.awayPenalties !== undefined && match.awayPenalties !== null;
  return hasPenalties ? `${base} pen ${match.homePenalties}-${match.awayPenalties}` : base;
}

function groupMatchesByCompetition(matches: FootballMatch[]) {
  const groups = new Map<string, {
    key: string;
    name: string;
    emblem: string | null;
    matches: FootballMatch[];
  }>();

  for (const match of matches) {
    const key = match.competitionCode || match.competitionName || 'football';
    const existing = groups.get(key);
    if (existing) {
      existing.matches.push(match);
    } else {
      groups.set(key, {
        key,
        name: match.competitionName || 'Football',
        emblem: match.competitionEmblem,
        matches: [match],
      });
    }
  }

  return [...groups.values()];
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="text-center py-16 text-slate-500 font-semibold">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ onRetry, language }: { onRetry: () => void; language: string }) {
  return (
    <div className="text-center py-16 text-slate-500">
      <p className="font-semibold">
        {language === 'vi' ? 'Không tải được dữ liệu bóng đá.' : 'Failed to load football data.'}
      </p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <FiRefreshCw /> {language === 'vi' ? 'Thử lại' : 'Retry'}
      </button>
    </div>
  );
}

function CompetitionMatchGroup({
  group,
  language,
  onOpenMatch,
}: {
  group: ReturnType<typeof groupMatchesByCompetition>[number];
  language: string;
  onOpenMatch: (match: FootballMatch) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            {group.emblem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.emblem} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <FiShield className="h-7 w-7 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-900 dark:text-slate-100 sm:text-lg">
              {group.name}
            </h3>
            <p className="text-xs font-semibold text-slate-400">
              {group.matches.length} {language === 'vi' ? 'trận' : group.matches.length === 1 ? 'match' : 'matches'}
            </p>
          </div>
        </div>
        {isOpen ? (
          <FiChevronUp className="h-6 w-6 shrink-0 text-slate-700 dark:text-slate-200" />
        ) : (
          <FiChevronDown className="h-6 w-6 shrink-0 text-slate-700 dark:text-slate-200" />
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-border">
          {group.matches.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              language={language}
              onClick={match.detailAvailable === false ? undefined : () => onOpenMatch(match)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MatchRow({
  match,
  language,
  onClick,
}: {
  match: FootballMatch;
  language: string;
  onClick?: () => void;
}) {
  const { time, day } = formatMatchTime(match.utcDate, language);
  const statusLabel = STATUS_LABEL[match.status];
  const isLive = match.status === 'LIVE' || match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const isFinished = match.status === 'FINISHED';
  const score = scoreText(match);
  const centerLabel = score
    ? isFinished
      ? language === 'vi' ? 'KT' : 'FT'
      : statusLabel ? (language === 'vi' ? statusLabel.vi : statusLabel.en) : match.status
    : day;
  const rowContent = (
    <>
      <div className="min-w-0 text-right text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
        <span className="block truncate">{match.homeTeam}</span>
      </div>
      <TeamCrest name={match.homeTeam} crest={match.homeTeamCrest} />
      <div className="text-center">
        <div className={`text-lg font-black tabular-nums sm:text-2xl ${isLive ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'}`}>
          {score || time}
        </div>
        <div className="mt-0.5 truncate text-[10px] font-black uppercase text-slate-400 sm:text-xs">
          {centerLabel}
        </div>
      </div>
      <TeamCrest name={match.awayTeam} crest={match.awayTeamCrest} />
      <div className="min-w-0 text-left text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
        <span className="block truncate">{match.awayTeam}</span>
      </div>
    </>
  );
  const rowClassName = `grid w-full grid-cols-[minmax(0,1fr)_2rem_4.5rem_2rem_minmax(0,1fr)] items-center gap-2 bg-card px-3 py-4 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_2.5rem_5.5rem_2.5rem_minmax(0,1fr)] sm:gap-3 sm:px-5 ${
    onClick ? 'hover:bg-slate-50 dark:hover:bg-slate-900/50' : 'cursor-default'
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClassName}>
        {rowContent}
      </button>
    );
  }

  return (
    <div className={rowClassName}>
      {rowContent}
    </div>
  );
}

function TeamCrest({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-50 dark:bg-slate-900 sm:h-10 sm:w-10">
      {crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" title={name} className="h-7 w-7 object-contain sm:h-9 sm:w-9" />
      ) : (
        <FiShield className="h-5 w-5 text-slate-300" />
      )}
    </div>
  );
}

function StandingsTable({
  groups,
  language,
}: {
  groups: FootballStandingGroup[];
  language: string;
}) {
  if (!groups.length || !groups.some((group) => group.table.length)) {
    return <EmptyState>{language === 'vi' ? 'Chưa có bảng xếp hạng cho giải này.' : 'No standings available for this competition.'}</EmptyState>;
  }

  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div key={`${group.stage || 'stage'}-${group.group || index}`} className="border border-border rounded-2xl bg-card overflow-hidden">
          {(group.group || group.stage) && (
            <div className="px-4 py-3 border-b border-border text-sm font-bold text-slate-700 dark:text-slate-200">
              {[group.stage, group.group].filter(Boolean).join(' · ')}
            </div>
          )}
          <div className="sm:hidden divide-y divide-border/70">
            {group.table.map((row) => (
              <div key={`${group.group || 'mobile-table'}-${row.team.id}`} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 shrink-0 text-center text-sm font-black text-slate-500">{row.position}</span>
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                      {row.team.crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.team.crest} alt="" className="w-6 h-6 object-contain" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{row.team.name}</div>
                      <div className="text-[11px] text-slate-400 font-semibold">
                        {row.playedGames}P · {row.won}W {row.draw}D {row.lost}L · GD {row.goalDifference}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black text-slate-900 dark:text-slate-100">{row.points}</div>
                    <div className="text-[10px] uppercase text-slate-400 font-bold">Pts</div>
                  </div>
                </div>
                {row.form && (
                  <div className="mt-2 text-[11px] text-slate-500 font-semibold">
                    {language === 'vi' ? 'Phong độ' : 'Form'}: {row.form}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs uppercase text-slate-400 border-b border-border">
                <tr>
                  <th className="w-12 py-3 text-center">#</th>
                  <th className="py-3 text-left">{language === 'vi' ? 'Đội' : 'Team'}</th>
                  <th className="py-3 text-center">P</th>
                  <th className="py-3 text-center">W</th>
                  <th className="py-3 text-center">D</th>
                  <th className="py-3 text-center">L</th>
                  <th className="py-3 text-center">GF</th>
                  <th className="py-3 text-center">GA</th>
                  <th className="py-3 text-center">GD</th>
                  <th className="py-3 text-center">Pts</th>
                  <th className="py-3 text-left">{language === 'vi' ? 'Phong độ' : 'Form'}</th>
                </tr>
              </thead>
              <tbody>
                {group.table.map((row) => (
                  <tr key={`${group.group || 'table'}-${row.team.id}`} className="border-b border-border/60 last:border-b-0">
                    <td className="py-3 text-center font-bold text-slate-500">{row.position}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2 min-w-0 font-semibold text-slate-800 dark:text-slate-100">
                        {row.team.crest && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.team.crest} alt="" className="w-6 h-6 object-contain" />
                        )}
                        <span className="truncate">{row.team.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center">{row.playedGames}</td>
                    <td className="py-3 text-center">{row.won}</td>
                    <td className="py-3 text-center">{row.draw}</td>
                    <td className="py-3 text-center">{row.lost}</td>
                    <td className="py-3 text-center">{row.goalsFor}</td>
                    <td className="py-3 text-center">{row.goalsAgainst}</td>
                    <td className="py-3 text-center">{row.goalDifference}</td>
                    <td className="py-3 text-center font-black text-slate-900 dark:text-slate-100">{row.points}</td>
                    <td className="py-3 text-xs text-slate-500">{row.form || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FootballSchedule() {
  const router = useRouter();
  const { language } = useTranslation();
  const [activeView, setActiveView] = useState<FootballView>('today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedLeague, setSelectedLeague] = useState(ALL_LEAGUES);
  const [selectedTeam, setSelectedTeam] = useState<FootballTeam | null>(null);
  const [teamMatches, setTeamMatches] = useState<FootballMatch[]>([]);
  const [teamMatchesLoading, setTeamMatchesLoading] = useState(false);
  const [teamMatchesError, setTeamMatchesError] = useState(false);

  const leaguesState = useAsync(
    () => cachedFootballRequest(
      ['leagues-vietnam-v1'],
      () => footballAPI.getLeagues().then((res) => res.data),
      24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
    ),
    [],
  );
  const todayState = useAsync(
    () => cachedFootballRequest(
      ['today-vietnam-v1'],
      () => footballAPI.getTodayMatches().then((res) => res.data),
      5 * 60 * 1000,
    ),
    [],
  );
  const concreteLeague = selectedLeague === ALL_LEAGUES ? 'PL' : selectedLeague;
  const scheduleState = useAsync(
    () => cachedFootballRequest(
      ['matches-vietnam-v1', weekOffset, selectedLeague],
      () => footballAPI.getMatches(
        weekOffset,
        selectedLeague === ALL_LEAGUES ? undefined : selectedLeague,
      ).then((res) => res.data),
    ),
    [weekOffset, selectedLeague],
  );
  const standingsState = useAsync(
    () => cachedFootballRequest(
      ['standings', concreteLeague],
      () => footballAPI.getStandings(concreteLeague).then((res) => res.data),
      30 * 60 * 1000,
      12 * 60 * 60 * 1000,
    ),
    [concreteLeague],
  );
  const teamsState = useAsync(
    () => cachedFootballRequest(
      ['teams', concreteLeague],
      () => footballAPI.getTeams(concreteLeague).then((res) => res.data),
      30 * 60 * 1000,
      12 * 60 * 60 * 1000,
    ),
    [concreteLeague],
  );

  const leagues = leaguesState.data?.leagues?.length ? leaguesState.data.leagues : FALLBACK_LEAGUES;
  const supportsAllLeagues = activeView === 'schedule';
  const leaguesForView = useMemo(
    () => activeView === 'schedule'
      ? leagues
      : leagues.filter((league) => !VIETNAM_LEAGUE_CODES.has(league.code)),
    [activeView, leagues],
  );
  const leagueOptions = useMemo(
    () => supportsAllLeagues
      ? [{
          code: ALL_LEAGUES,
          name: language === 'vi' ? 'Tất cả trận đấu' : 'All matches',
          area: '',
        }, ...leaguesForView]
      : leaguesForView,
    [language, leaguesForView, supportsAllLeagues],
  );
  const selectedLeagueInfo = useMemo(
    () => leagueOptions.find((league) => league.code === selectedLeague) || leagueOptions[0],
    [leagueOptions, selectedLeague],
  );

  useEffect(() => {
    if (selectedLeagueInfo && selectedLeagueInfo.code !== selectedLeague) {
      setSelectedLeague(selectedLeagueInfo.code);
    }
  }, [selectedLeague, selectedLeagueInfo]);

  useEffect(() => {
    setSelectedTeam(null);
    setTeamMatches([]);
  }, [selectedLeague]);

  useEffect(() => {
    if (!supportsAllLeagues && selectedLeague === ALL_LEAGUES) {
      setSelectedLeague(leaguesForView[0]?.code || 'PL');
    }
  }, [leaguesForView, selectedLeague, supportsAllLeagues]);

  useEffect(() => {
    if (!selectedTeam) return;

    let cancelled = false;
    setTeamMatchesLoading(true);
    setTeamMatchesError(false);
    cachedFootballRequest(
      ['team-matches', selectedTeam.id, 'SCHEDULED', 8],
      () => footballAPI.getTeamMatches(selectedTeam.id, 'SCHEDULED', 8).then((res) => res.data),
      10 * 60 * 1000,
    )
      .then((res) => {
        if (!cancelled) setTeamMatches(res.matches || []);
      })
      .catch(() => {
        if (!cancelled) setTeamMatchesError(true);
      })
      .finally(() => {
        if (!cancelled) setTeamMatchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeam]);

  const renderMatches = (matches: FootballMatch[], emptyText: string) => {
    if (!matches.length) return <EmptyState>{emptyText}</EmptyState>;
    const groups = groupMatchesByCompetition(matches);

    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <CompetitionMatchGroup
            key={group.key}
            group={group}
            language={language}
            onOpenMatch={(match) => router.push(`/football/matches/${match.id}`)}
          />
        ))}
      </div>
    );
  };

  const renderActiveView = () => {
    if (activeView === 'today') {
      if (todayState.isLoading) return <LoadingState />;
      if (todayState.error) return <ErrorState language={language} onRetry={todayState.refetch} />;
      return renderMatches(
        todayState.data?.matches || [],
        language === 'vi' ? 'Không có trận nào hôm nay.' : 'No matches today.',
      );
    }

    if (activeView === 'schedule') {
      if (scheduleState.isLoading) return <LoadingState />;
      if (scheduleState.error) return <ErrorState language={language} onRetry={scheduleState.refetch} />;
      return renderMatches(
        scheduleState.data?.matches || [],
        selectedLeague === ALL_LEAGUES
          ? language === 'vi'
            ? 'Không có trận nào trong tuần này.'
            : 'No matches scheduled this week.'
          : language === 'vi'
            ? 'Không có trận nào trong tuần này cho giải đã chọn.'
            : 'No matches scheduled this week for the selected competition.',
      );
    }

    if (activeView === 'standings') {
      if (standingsState.isLoading) return <LoadingState />;
      if (standingsState.error) return <ErrorState language={language} onRetry={standingsState.refetch} />;
      return <StandingsTable groups={standingsState.data?.standings || []} language={language} />;
    }

    if (teamsState.isLoading) return <LoadingState />;
    if (teamsState.error) return <ErrorState language={language} onRetry={teamsState.refetch} />;

    const teams = teamsState.data?.teams || [];
    if (!teams.length) {
      return <EmptyState>{language === 'vi' ? 'Không có danh sách đội cho giải này.' : 'No teams available for this competition.'}</EmptyState>;
    }

    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="grid sm:grid-cols-2 gap-3">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className={`text-left bg-card border rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all ${
                selectedTeam?.id === team.id ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  {team.crest ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.crest} alt="" className="w-9 h-9 object-contain" />
                  ) : (
                    <FiShield className="text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{team.name}</div>
                  <div className="text-xs text-slate-500 font-semibold">
                    {[team.tla, team.venue].filter(Boolean).join(' · ') || (language === 'vi' ? 'Chưa có sân vận động' : 'No venue')}
                  </div>
                  {team.founded && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      {language === 'vi' ? 'Thành lập' : 'Founded'} {team.founded}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 min-h-[240px]">
          <h3 className="font-black text-slate-900 dark:text-slate-100 mb-2">
            {selectedTeam
              ? selectedTeam.name
              : language === 'vi'
                ? 'Chọn một đội'
                : 'Select a team'}
          </h3>
          {!selectedTeam ? (
            <p className="text-sm text-slate-500 font-semibold">
              {language === 'vi' ? 'Bấm vào đội để xem vài trận sắp tới nếu hệ thống có dữ liệu.' : 'Pick a team to fetch upcoming matches when data is available.'}
            </p>
          ) : teamMatchesLoading ? (
            <LoadingState />
          ) : teamMatchesError ? (
            <p className="text-sm text-slate-500 font-semibold">
              {language === 'vi' ? 'Không tải được lịch đội này.' : 'Could not load this team schedule.'}
            </p>
          ) : teamMatches.length === 0 ? (
            <p className="text-sm text-slate-500 font-semibold">
              {language === 'vi' ? 'Free API chưa trả trận sắp tới cho đội này.' : 'No upcoming matches returned for this team.'}
            </p>
          ) : (
            <div className="space-y-2">
              {teamMatches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  language={language}
                  onClick={() => router.push(`/football/matches/${match.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-sm shadow-emerald-100">
            <FiShield className="text-emerald-600" size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'Lịch Bóng đá' : 'Football Calendar'}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
              {language === 'vi'
                ? 'Lịch, kết quả, bảng xếp hạng và đội bóng'
                : 'Schedules, scores, standings and teams'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-slate-500 w-full sm:max-w-xl">
          <FiAlertCircle className="shrink-0 text-amber-500" />
          <span>
            {language === 'vi'
              ? 'Live, lineup, thẻ, thay người, scorer, stats và odds là dữ liệu không đảm bảo trên free plan.'
              : 'Live, lineup, cards, substitutions, scorers, stats and odds are not guaranteed on the free plan.'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {(Object.keys(VIEW_META) as FootballView[]).map((view) => {
          const meta = VIEW_META[view];
          const Icon = meta.icon;
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                activeView === view
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="shrink-0" />
              {language === 'vi' ? meta.vi : meta.en}
            </button>
          );
        })}
      </div>

      {activeView !== 'today' && (
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3 bg-card border border-border rounded-2xl px-3 sm:px-4 py-3">
          <label className="text-xs font-black uppercase text-slate-400">
            {language === 'vi' ? 'Giải đấu' : 'Competition'}
          </label>
          <Select
            value={selectedLeague}
            onValueChange={(nextLeague) => {
              if (nextLeague) setSelectedLeague(nextLeague);
            }}
          >
            <SelectTrigger className="h-10 w-full sm:w-auto sm:min-w-[220px] py-2 px-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} className="min-w-[260px]">
              {leagueOptions.map((league) => (
                <SelectItem key={league.code} value={league.code}>
                  {league.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {activeView === 'schedule' && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-card border border-border rounded-2xl px-3 sm:px-4 py-3">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="justify-self-start flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs sm:text-sm transition-colors shrink-0"
          >
            <FiChevronLeft className="shrink-0" />
            <span className="sm:hidden">{language === 'vi' ? 'Trước' : 'Prev'}</span>
            <span className="hidden sm:inline">{language === 'vi' ? 'Tuần trước' : 'Prev week'}</span>
          </button>
          <div className="text-center min-w-0">
            <div className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100">{scheduleState.data?.weekLabel || '-'}</div>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-primary font-semibold hover:underline"
              >
                {language === 'vi' ? 'Về tuần này' : 'Back to this week'}
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="justify-self-end flex items-center gap-1 px-2 sm:px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs sm:text-sm transition-colors shrink-0"
          >
            <span className="sm:hidden">{language === 'vi' ? 'Sau' : 'Next'}</span>
            <span className="hidden sm:inline">{language === 'vi' ? 'Tuần sau' : 'Next week'}</span>
            <FiChevronRight className="shrink-0" />
          </button>
        </div>
      )}

      {renderActiveView()}

    </div>
  );
}
