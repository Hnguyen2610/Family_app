'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
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
import MatchDetailModal from './MatchDetailModal';

type FootballView = 'today' | 'schedule' | 'standings' | 'teams';

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
  { code: 'BSA', name: 'Brazil Serie A', area: 'Brazil' },
  { code: 'CL', name: 'Champions League', area: 'Europe' },
  { code: 'WC', name: 'World Cup', area: 'World' },
  { code: 'EC', name: 'European Championship', area: 'Europe' },
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

function MatchRow({
  match,
  language,
  onClick,
}: {
  match: FootballMatch;
  language: string;
  onClick: () => void;
}) {
  const { time, day } = formatMatchTime(match.utcDate, language);
  const statusLabel = STATUS_LABEL[match.status];
  const isLive = match.status === 'LIVE' || match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const score = scoreText(match);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-card border border-border rounded-2xl px-4 py-3 hover:shadow-sm hover:border-primary/40 transition-all text-left"
    >
      <div className="w-16 shrink-0 text-center">
        <div className="text-xs text-slate-400 font-semibold uppercase">{day}</div>
        <div className="font-bold text-slate-800 dark:text-slate-100">{time}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary/80 mb-0.5">
          {match.competitionEmblem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.competitionEmblem} alt="" className="w-4 h-4 object-contain" />
          )}
          <span className="truncate">{match.competitionName}</span>
        </div>
        <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
          {match.homeTeam} <span className="text-slate-400">vs</span> {match.awayTeam}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {score && (
          <div className={`font-bold ${isLive ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}`}>
            {score}
          </div>
        )}
        <div className="text-[11px] text-slate-400 font-semibold">
          {statusLabel ? (language === 'vi' ? statusLabel.vi : statusLabel.en) : match.status}
        </div>
      </div>
    </button>
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
        <div key={`${group.stage || 'stage'}-${group.group || index}`} className="overflow-x-auto border border-border rounded-2xl bg-card">
          {(group.group || group.stage) && (
            <div className="px-4 py-3 border-b border-border text-sm font-bold text-slate-700 dark:text-slate-200">
              {[group.stage, group.group].filter(Boolean).join(' · ')}
            </div>
          )}
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
      ))}
    </div>
  );
}

export default function FootballSchedule() {
  const { language } = useTranslation();
  const [activeView, setActiveView] = useState<FootballView>('today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedLeague, setSelectedLeague] = useState('PL');
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<FootballTeam | null>(null);
  const [teamMatches, setTeamMatches] = useState<FootballMatch[]>([]);
  const [teamMatchesLoading, setTeamMatchesLoading] = useState(false);
  const [teamMatchesError, setTeamMatchesError] = useState(false);

  const leaguesState = useAsync(
    () => footballAPI.getLeagues().then((res) => res.data),
    [],
  );
  const todayState = useAsync(
    () => footballAPI.getTodayMatches().then((res) => res.data),
    [],
  );
  const scheduleState = useAsync(
    () => footballAPI.getMatches(weekOffset, selectedLeague).then((res) => res.data),
    [weekOffset, selectedLeague],
  );
  const standingsState = useAsync(
    () => footballAPI.getStandings(selectedLeague).then((res) => res.data),
    [selectedLeague],
  );
  const teamsState = useAsync(
    () => footballAPI.getTeams(selectedLeague).then((res) => res.data),
    [selectedLeague],
  );

  const leagues = leaguesState.data?.leagues?.length ? leaguesState.data.leagues : FALLBACK_LEAGUES;
  const selectedLeagueInfo = useMemo(
    () => leagues.find((league) => league.code === selectedLeague) || leagues[0],
    [leagues, selectedLeague],
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
    if (!selectedTeam) return;

    let cancelled = false;
    setTeamMatchesLoading(true);
    setTeamMatchesError(false);
    footballAPI.getTeamMatches(selectedTeam.id, 'SCHEDULED', 8)
      .then((res) => {
        if (!cancelled) setTeamMatches(res.data.matches || []);
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
    return (
      <div className="space-y-2">
        {matches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            language={language}
            onClick={() => setSelectedMatchId(match.id)}
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
        language === 'vi' ? 'Không có trận nào hôm nay trong các giải free.' : 'No free-tier matches today.',
      );
    }

    if (activeView === 'schedule') {
      if (scheduleState.isLoading) return <LoadingState />;
      if (scheduleState.error) return <ErrorState language={language} onRetry={scheduleState.refetch} />;
      return renderMatches(
        scheduleState.data?.matches || [],
        language === 'vi' ? 'Không có trận nào trong tuần này cho giải đã chọn.' : 'No matches scheduled this week for the selected competition.',
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
              {language === 'vi' ? 'Bấm vào đội để xem vài trận sắp tới nếu free API trả dữ liệu.' : 'Pick a team to fetch upcoming matches when the free API provides them.'}
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
                  onClick={() => setSelectedMatchId(match.id)}
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-sm shadow-emerald-100">
            <FiShield className="text-emerald-600" size={24} />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'Bóng đá' : 'Football'}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {language === 'vi'
                ? 'Lịch, kết quả, bảng xếp hạng và đội bóng từ các giải free'
                : 'Schedules, scores, standings and teams from free-tier competitions'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-slate-500 max-w-xl">
          <FiAlertCircle className="shrink-0 text-amber-500" />
          <span>
            {language === 'vi'
              ? 'Live, lineup, thẻ, thay người, scorer, stats và odds là dữ liệu không đảm bảo trên free plan.'
              : 'Live, lineup, cards, substitutions, scorers, stats and odds are not guaranteed on the free plan.'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VIEW_META) as FootballView[]).map((view) => {
          const meta = VIEW_META[view];
          const Icon = meta.icon;
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
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
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
          <label className="text-xs font-black uppercase text-slate-400">
            {language === 'vi' ? 'Giải đấu' : 'Competition'}
          </label>
          <select
            value={selectedLeague}
            onChange={(event) => setSelectedLeague(event.target.value)}
            className="h-10 min-w-[220px] rounded-xl border border-border bg-background px-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/30"
          >
            {leagues.map((league) => (
              <option key={league.code} value={league.code}>
                {league.name} ({league.code})
              </option>
            ))}
          </select>
          {selectedLeagueInfo && (
            <span className="text-xs font-semibold text-slate-500">
              {selectedLeagueInfo.area}
            </span>
          )}
        </div>
      )}

      {activeView === 'schedule' && (
        <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-colors"
          >
            <FiChevronLeft /> {language === 'vi' ? 'Tuần trước' : 'Prev week'}
          </button>
          <div className="text-center">
            <div className="font-bold text-slate-800 dark:text-slate-100">{scheduleState.data?.weekLabel || '-'}</div>
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
            className="flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-colors"
          >
            {language === 'vi' ? 'Tuần sau' : 'Next week'} <FiChevronRight />
          </button>
        </div>
      )}

      {renderActiveView()}

      {selectedMatchId !== null && (
        <MatchDetailModal matchId={selectedMatchId} onClose={() => setSelectedMatchId(null)} />
      )}
    </div>
  );
}
