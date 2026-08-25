'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  FiArrowLeft,
  FiChevronRight,
  FiHash,
  FiMapPin,
  FiRefreshCw,
  FiUsers,
} from 'react-icons/fi';
import {
  footballAPI,
  type FootballBookingEvent,
  type FootballLineupPlayer,
  type FootballMatchDetail,
  type FootballMatchOdds,
  type FootballMatchSide,
  type FootballSubstitutionEvent,
} from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { useAsync } from '@/hooks/useAsync';
import { cachedFootballRequest } from '@/lib/football-cache';

type FootballMatchDetailScreenProps = {
  matchId: number;
  onBack: () => void;
};

type FootballTab = 'overview' | 'lineups' | 'stats';

const STAGE_LABEL: Record<string, { vi: string; en: string }> = {
  REGULAR_SEASON: { vi: 'Mùa giải chính', en: 'Regular Season' },
  GROUP_STAGE: { vi: 'Vòng bảng', en: 'Group Stage' },
  LAST_16: { vi: 'Vòng 1/8', en: 'Round of 16' },
  QUARTER_FINALS: { vi: 'Tứ kết', en: 'Quarter-finals' },
  SEMI_FINALS: { vi: 'Bán kết', en: 'Semi-finals' },
  FINAL: { vi: 'Chung kết', en: 'Final' },
};

const STAT_LABELS: Record<string, { vi: string; en: string; isPercent?: boolean }> = {
  ball_possession: { vi: 'Kiểm soát bóng', en: 'Possession', isPercent: true },
  shots: { vi: 'Tổng cú sút', en: 'Shots' },
  shots_on_goal: { vi: 'Sút trúng đích', en: 'Shots on target' },
  corner_kicks: { vi: 'Phạt góc', en: 'Corners' },
  fouls: { vi: 'Lỗi', en: 'Fouls' },
  offsides: { vi: 'Việt vị', en: 'Offsides' },
  saves: { vi: 'Cứu thua', en: 'Saves' },
  yellow_cards: { vi: 'Thẻ vàng', en: 'Yellow cards' },
  red_cards: { vi: 'Thẻ đỏ', en: 'Red cards' },
};

// The compact "Tổng quan" preview only has room for a few headline numbers.
const OVERVIEW_STAT_KEYS = ['shots_on_goal', 'corner_kicks', 'yellow_cards'];

type TimelineEvent = {
  key: string;
  kind: 'goal' | 'booking' | 'substitution' | 'marker';
  minute: number | null;
  injuryTime?: number | null;
  side: FootballMatchSide;
  icon: string;
  text: string;
  runningScore?: string;
  markerLabel?: string;
};

function buildTimeline(
  deepData: FootballMatchDetail['deepData'],
  status: string,
  halfTime: { home: number | null; away: number | null },
  language: string,
): TimelineEvent[] {
  type RawEvent = {
    minute: number | null;
    injuryTime?: number | null;
    side: FootballMatchSide;
    kind: 'goal' | 'booking' | 'substitution';
    icon: string;
    text: string;
  };
  const raw: RawEvent[] = [];

  deepData.goals.forEach((goal) => {
    const tag = goal.type === 'PENALTY' ? ' (phạt đền)' : goal.type === 'OWN' ? ' (phản lưới nhà)' : '';
    raw.push({
      minute: goal.minute,
      injuryTime: goal.injuryTime,
      side: goal.side,
      kind: 'goal',
      icon: '⚽',
      text: `${goal.scorer || 'Bàn thắng'}${tag}${goal.assist ? ` · kiến tạo: ${goal.assist}` : ''}`,
    });
  });
  deepData.bookings.forEach((booking) => {
    raw.push({
      minute: booking.minute,
      side: booking.side,
      kind: 'booking',
      icon: booking.card === 'RED' || booking.card === 'YELLOW_RED' ? '🟥' : '🟨',
      text: booking.player || 'Thẻ phạt',
    });
  });
  deepData.substitutions.forEach((sub) => {
    raw.push({
      minute: sub.minute,
      side: sub.side,
      kind: 'substitution',
      icon: '🔁',
      text: `${sub.playerIn || '?'} thay ${sub.playerOut || '?'}`,
    });
  });

  if (raw.length === 0) return [];

  raw.sort((a, b) => {
    const minuteDiff = (a.minute ?? 9999) - (b.minute ?? 9999);
    if (minuteDiff !== 0) return minuteDiff;
    return (a.injuryTime ?? 0) - (b.injuryTime ?? 0);
  });

  let homeScore = 0;
  let awayScore = 0;
  let halfTimeInserted = false;
  const events: TimelineEvent[] = [
    { key: 'kickoff', kind: 'marker', minute: 0, side: null, icon: '', text: '', markerLabel: language === 'vi' ? 'Bắt đầu trận đấu' : 'Kick-off' },
  ];

  raw.forEach((item, index) => {
    if (!halfTimeInserted && (item.minute ?? 0) > 45) {
      events.push({
        key: 'halftime',
        kind: 'marker',
        minute: 45,
        side: null,
        icon: '',
        text: '',
        markerLabel: `${language === 'vi' ? 'Hết hiệp 1' : 'Half-time'} ${halfTime.home ?? homeScore} - ${halfTime.away ?? awayScore}`,
      });
      halfTimeInserted = true;
    }
    if (item.kind === 'goal') {
      if (item.side === 'HOME') homeScore += 1;
      else if (item.side === 'AWAY') awayScore += 1;
    }
    events.push({
      key: `${item.kind}-${index}`,
      kind: item.kind,
      minute: item.minute,
      injuryTime: item.injuryTime,
      side: item.side,
      icon: item.icon,
      text: item.text,
      runningScore: item.kind === 'goal' ? `${homeScore} - ${awayScore}` : undefined,
    });
  });

  if (!halfTimeInserted) {
    events.push({
      key: 'halftime',
      kind: 'marker',
      minute: 45,
      side: null,
      icon: '',
      text: '',
      markerLabel: `${language === 'vi' ? 'Hết hiệp 1' : 'Half-time'} ${halfTime.home ?? homeScore} - ${halfTime.away ?? awayScore}`,
    });
  }

  if (status === 'FINISHED') {
    events.push({
      key: 'fulltime',
      kind: 'marker',
      minute: 9999,
      side: null,
      icon: '',
      text: '',
      markerLabel: `${language === 'vi' ? 'Kết thúc trận đấu' : 'Full-time'} ${homeScore} - ${awayScore}`,
    });
  }

  return events;
}

export default function FootballMatchDetailScreen({ matchId, onBack }: FootballMatchDetailScreenProps) {
  const { language } = useTranslation();
  const [activeTab, setActiveTab] = useState<FootballTab>('overview');
  const { data, isLoading, error, refetch } = useAsync(
    () => cachedFootballRequest(
      ['match-detail-v4', matchId],
      () => footballAPI.getMatchDetail(matchId).then((res) => res.data),
      20 * 60 * 1000,
    ),
    [matchId],
  );

  const stageLabel = data?.stage ? STAGE_LABEL[data.stage] : undefined;
  const hasHalfTime = data?.score.halfTime.home !== null && data?.score.halfTime.home !== undefined;

  const timeline = data ? buildTimeline(data.deepData, data.status, data.score.halfTime, language) : [];
  const goalEvents = timeline.filter((event) => event.kind === 'goal');
  const hasLineups = Boolean(data && (data.deepData.homeLineup.length > 0 || data.deepData.awayLineup.length > 0));
  const statRows = data ? buildStatRows(data.deepData.homeStatistics, data.deepData.awayStatistics) : [];
  const overviewStatRows = statRows.filter((row) => OVERVIEW_STAT_KEYS.includes(row.key));
  const odds = data?.deepData.odds || null;
  const hasDeepData = timeline.length > 0 || hasLineups || statRows.length > 0 || Boolean(odds);

  const TABS: Array<{ key: FootballTab; vi: string; en: string }> = [
    { key: 'overview', vi: 'Tổng quan', en: 'Overview' },
    { key: 'lineups', vi: 'Đội hình', en: 'Lineups' },
    { key: 'stats', vi: 'Thống kê', en: 'Stats' },
  ];

  if (!Number.isFinite(matchId)) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
          <FiArrowLeft /> {language === 'vi' ? 'Quay lại bóng đá' : 'Back to football'}
        </button>
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm font-semibold text-slate-500">
          {language === 'vi' ? 'Mã trận đấu không hợp lệ.' : 'Invalid match id.'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
        <FiArrowLeft /> {language === 'vi' ? 'Quay lại lịch bóng đá' : 'Back to football schedule'}
      </button>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative bg-gradient-to-br from-emerald-600 to-teal-600 px-4 py-5 text-white sm:px-6">
          <div className="flex items-center justify-center gap-2">
            {data?.competitionEmblem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.competitionEmblem} alt="" className="w-6 h-6 object-contain" />
            )}
            <h2 className="text-sm font-black uppercase tracking-wide">
              {data?.competitionName || (language === 'vi' ? 'Chi tiết trận đấu' : 'Match detail')}
            </h2>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error || !data ? (
            <div className="py-16 text-center">
              <p className="font-semibold text-slate-500">
                {language === 'vi' ? 'Không tải được chi tiết trận đấu.' : 'Failed to load match details.'}
              </p>
              <button onClick={refetch} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                <FiRefreshCw /> {language === 'vi' ? 'Thử lại' : 'Retry'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
                <div className="flex min-w-0 flex-col items-center gap-2">
                  {data.homeTeam.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.homeTeam.crest} alt="" className="h-14 w-14 object-contain sm:h-20 sm:w-20" />
                  )}
                  <span className="w-full break-words text-center text-sm font-black text-slate-800 dark:text-slate-100 sm:text-base">
                    {data.homeTeam.name}
                  </span>
                </div>
                <div className="shrink-0 text-2xl font-black text-slate-700 dark:text-slate-200 sm:text-4xl">
                  {data.score.fullTime.home ?? '-'} : {data.score.fullTime.away ?? '-'}
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2">
                  {data.awayTeam.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.awayTeam.crest} alt="" className="h-14 w-14 object-contain sm:h-20 sm:w-20" />
                  )}
                  <span className="w-full break-words text-center text-sm font-black text-slate-800 dark:text-slate-100 sm:text-base">
                    {data.awayTeam.name}
                  </span>
                </div>
              </div>

              {hasHalfTime && (
                <p className="text-center text-xs font-semibold text-slate-400">
                  {language === 'vi' ? 'Tỉ số hiệp 1' : 'Half-time'}: {data.score.halfTime.home} - {data.score.halfTime.away}
                </p>
              )}

              <div className="grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
                {data.matchday !== null && (
                  <DetailLine icon={<FiHash />} text={language === 'vi' ? `Vòng đấu ${data.matchday}` : `Matchday ${data.matchday}`} />
                )}
                {stageLabel && (
                  <DetailLine icon={<FiHash />} text={`${language === 'vi' ? stageLabel.vi : stageLabel.en}${data.group ? ` · ${data.group}` : ''}`} />
                )}
                {data.venue && <DetailLine icon={<FiMapPin />} text={data.venue} />}
                {data.referees.length > 0 && (
                  <DetailLine icon={<FiUsers />} text={`${language === 'vi' ? 'Trọng tài: ' : 'Referee: '}${data.referees.join(', ')}`} />
                )}
              </div>

              {!hasDeepData ? (
                <p className="border-t border-border pt-5 text-xs font-semibold text-slate-400">
                  {language === 'vi'
                    ? 'Chưa có dữ liệu chuyên sâu (sự kiện/đội hình/thống kê/odds) cho trận này — gói free của football-data.org thường không trả cho đa số trận.'
                    : 'No deep data (events/lineups/stats/odds) for this match yet — the football-data.org free plan usually doesn\'t return it.'}
                </p>
              ) : (
                <div className="border-t border-border pt-3">
                  <div className="mb-4 flex items-center gap-5 border-b border-border text-sm font-bold text-slate-400">
                    {TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`-mb-px border-b-2 pb-2.5 transition-colors ${
                          activeTab === tab.key
                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'border-transparent hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                      >
                        {language === 'vi' ? tab.vi : tab.en}
                      </button>
                    ))}
                  </div>

                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      {overviewStatRows.length > 0 && (
                        <MatchInfoCard
                          title={language === 'vi' ? 'Thống kê' : 'Stats'}
                          onTitleClick={() => setActiveTab('stats')}
                        >
                          <div className="space-y-3">
                            {overviewStatRows.map((row) => (
                              <StatRow key={row.key} label={language === 'vi' ? row.vi : row.en} home={row.home} away={row.away} isPercent={row.isPercent} />
                            ))}
                          </div>
                        </MatchInfoCard>
                      )}

                      {goalEvents.length > 0 && (
                        <MatchInfoCard title={language === 'vi' ? 'Bàn thắng' : 'Goals'}>
                          <MatchTimeline events={goalEvents} />
                        </MatchInfoCard>
                      )}

                      {timeline.length > 0 && (
                        <MatchInfoCard title={language === 'vi' ? 'Diễn biến' : 'Match events'}>
                          <MatchTimeline events={timeline} />
                        </MatchInfoCard>
                      )}

                      {odds && (
                        <MatchInfoCard title={language === 'vi' ? 'Tỷ lệ cược' : 'Odds'}>
                          <OddsTiles odds={odds} language={language} />
                        </MatchInfoCard>
                      )}
                    </div>
                  )}

                  {activeTab === 'lineups' && (
                    <LineupsTab
                      homeTeamName={data.homeTeam.name}
                      awayTeamName={data.awayTeam.name}
                      homeStarters={data.deepData.homeLineup}
                      awayStarters={data.deepData.awayLineup}
                      homeBench={data.deepData.homeBench}
                      awayBench={data.deepData.awayBench}
                      homeFormation={data.deepData.homeFormation}
                      awayFormation={data.deepData.awayFormation}
                      bookings={data.deepData.bookings}
                      substitutions={data.deepData.substitutions}
                      language={language}
                    />
                  )}

                  {activeTab === 'stats' && (
                    statRows.length > 0 ? (
                      <MatchInfoCard title={language === 'vi' ? 'Thống kê trận đấu' : 'Match statistics'}>
                        <div className="space-y-3">
                          {statRows.map((row) => (
                            <StatRow key={row.key} label={language === 'vi' ? row.vi : row.en} home={row.home} away={row.away} isPercent={row.isPercent} />
                          ))}
                        </div>
                      </MatchInfoCard>
                    ) : (
                      <p className="text-xs font-semibold text-slate-400">
                        {language === 'vi' ? 'Chưa có thống kê cho trận này.' : 'No statistics for this match yet.'}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchInfoCard({ title, onTitleClick, children }: { title: string; onTitleClick?: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {onTitleClick ? (
        <button onClick={onTitleClick} className="mb-2.5 flex w-full items-center justify-between text-xs font-black uppercase text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          {title}
          <FiChevronRight />
        </button>
      ) : (
        <p className="mb-2.5 text-xs font-black uppercase text-slate-400">{title}</p>
      )}
      {children}
    </div>
  );
}

function MatchTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="space-y-1.5">
      {events.map((event) => {
        if (event.kind === 'marker') {
          return (
            <div key={event.key} className="my-1 flex items-center gap-2 text-[10.5px] font-black uppercase tracking-wide text-slate-400">
              <div className="h-px flex-1 bg-border" />
              <span className="shrink-0">{event.markerLabel}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          );
        }
        const minuteLabel = event.minute != null ? `${event.minute}${event.injuryTime ? `+${event.injuryTime}` : ''}'` : '';
        return (
          <div key={event.key} className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-2 text-xs sm:text-sm">
            <div className="min-w-0 truncate text-right font-semibold text-slate-700 dark:text-slate-200">
              {(event.side === 'HOME' || event.side === null) && `${event.icon} ${event.text}`}
            </div>
            <div className="flex flex-col items-center text-center text-[11px] font-black tabular-nums text-slate-400">
              <span>{minuteLabel}</span>
              {event.runningScore && <span className="text-slate-600 dark:text-slate-300">{event.runningScore}</span>}
            </div>
            <div className="min-w-0 truncate text-left font-semibold text-slate-700 dark:text-slate-200">
              {event.side === 'AWAY' && `${event.icon} ${event.text}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineupsTab({
  homeTeamName,
  awayTeamName,
  homeStarters,
  awayStarters,
  homeBench,
  awayBench,
  homeFormation,
  awayFormation,
  bookings,
  substitutions,
  language,
}: {
  homeTeamName: string;
  awayTeamName: string;
  homeStarters: FootballLineupPlayer[];
  awayStarters: FootballLineupPlayer[];
  homeBench: FootballLineupPlayer[];
  awayBench: FootballLineupPlayer[];
  homeFormation: string | null;
  awayFormation: string | null;
  bookings: FootballBookingEvent[];
  substitutions: FootballSubstitutionEvent[];
  language: string;
}) {
  if (!homeStarters.length && !awayStarters.length) {
    return (
      <p className="text-xs font-semibold text-slate-400">
        {language === 'vi' ? 'Chưa có đội hình cho trận này.' : 'No lineups for this match yet.'}
      </p>
    );
  }

  const homeRows = buildPitchRows(homeStarters, homeFormation);
  const awayRows = buildPitchRows(awayStarters, awayFormation);
  const cardByPlayer = buildCardMap(bookings);
  const subOutSet = new Set(substitutions.map((s) => s.playerOut).filter((name): name is string => Boolean(name)));

  return (
    <div className="space-y-4">
      {homeRows && awayRows ? (
        <FormationPitch
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeFormation={homeFormation}
          awayFormation={awayFormation}
          homeRows={homeRows}
          awayRows={awayRows}
          cardByPlayer={cardByPlayer}
          subOutSet={subOutSet}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <LineupColumn teamName={homeTeamName} formation={homeFormation} starters={homeStarters} bench={homeBench} language={language} />
          <LineupColumn teamName={awayTeamName} formation={awayFormation} starters={awayStarters} bench={awayBench} language={language} />
        </div>
      )}

      {(homeBench.length > 0 || awayBench.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <BenchList teamName={homeTeamName} players={homeBench} language={language} />
          <BenchList teamName={awayTeamName} players={awayBench} language={language} />
        </div>
      )}
    </div>
  );
}

function parseFormationRows(formation: string | null): number[] {
  if (!formation) return [];
  return formation
    .split('-')
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function buildPitchRows(starters: FootballLineupPlayer[], formation: string | null): FootballLineupPlayer[][] | null {
  if (!starters.length) return null;
  const rowSizes = parseFormationRows(formation);
  const outfieldTotal = rowSizes.reduce((sum, n) => sum + n, 0);
  if (!rowSizes.length || outfieldTotal + 1 !== starters.length) return null;

  const [goalkeeper, ...outfield] = starters;
  const rows: FootballLineupPlayer[][] = [[goalkeeper]];
  let cursor = 0;
  for (const size of rowSizes) {
    rows.push(outfield.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

function buildCardMap(bookings: FootballBookingEvent[]): Map<string, 'YELLOW' | 'RED'> {
  const map = new Map<string, 'YELLOW' | 'RED'>();
  for (const booking of bookings) {
    if (!booking.player) continue;
    const isRed = booking.card === 'RED' || booking.card === 'YELLOW_RED';
    if (isRed || !map.has(booking.player)) map.set(booking.player, isRed ? 'RED' : 'YELLOW');
  }
  return map;
}

function FormationPitch({
  homeTeamName,
  awayTeamName,
  homeFormation,
  awayFormation,
  homeRows,
  awayRows,
  cardByPlayer,
  subOutSet,
}: {
  homeTeamName: string;
  awayTeamName: string;
  homeFormation: string | null;
  awayFormation: string | null;
  homeRows: FootballLineupPlayer[][];
  awayRows: FootballLineupPlayer[][];
  cardByPlayer: Map<string, 'YELLOW' | 'RED'>;
  subOutSet: Set<string>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <span className="truncate">{homeTeamName} {homeFormation && `(${homeFormation})`}</span>
        <span className="truncate text-right">{awayFormation && `(${awayFormation})`} {awayTeamName}</span>
      </div>
      <div className="relative bg-gradient-to-b from-emerald-600 via-emerald-600/95 to-emerald-700 px-2 py-4">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 sm:h-20 sm:w-20" />
        <PitchHalf rows={homeRows} mirrored={false} cardByPlayer={cardByPlayer} subOutSet={subOutSet} />
        <PitchHalf rows={awayRows} mirrored cardByPlayer={cardByPlayer} subOutSet={subOutSet} />
      </div>
    </div>
  );
}

function PitchHalf({
  rows,
  mirrored,
  cardByPlayer,
  subOutSet,
}: {
  rows: FootballLineupPlayer[][];
  mirrored: boolean;
  cardByPlayer: Map<string, 'YELLOW' | 'RED'>;
  subOutSet: Set<string>;
}) {
  const ordered = mirrored ? [...rows].reverse() : rows;
  return (
    <div className="relative flex flex-col gap-3 py-1.5 sm:gap-4">
      {ordered.map((row, index) => (
        <div key={index} className="flex justify-center gap-2.5 sm:gap-5">
          {row.map((player) => (
            <PitchPlayer
              key={player.id ?? player.name}
              player={player}
              card={cardByPlayer.get(player.name)}
              subbedOut={subOutSet.has(player.name)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PitchPlayer({ player, card, subbedOut }: { player: FootballLineupPlayer; card?: 'YELLOW' | 'RED'; subbedOut?: boolean }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 sm:w-16">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[11px] font-black text-slate-800 shadow-sm sm:h-11 sm:w-11 sm:text-sm">
        {player.shirtNumber ?? '-'}
        {card && (
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2 rounded-[1px] sm:h-3 sm:w-2.5 ${card === 'RED' ? 'bg-red-500' : 'bg-yellow-400'}`} />
        )}
        {subbedOut && <span className="absolute -bottom-1 -right-1 text-[9px] sm:text-[11px]">🔁</span>}
      </div>
      <span className="max-w-full truncate text-center text-[8.5px] font-bold leading-tight text-white drop-shadow sm:text-[10px]">
        {player.name}
      </span>
    </div>
  );
}

function LineupColumn({
  teamName,
  formation,
  starters,
  bench,
  language,
}: {
  teamName: string;
  formation: string | null;
  starters: FootballLineupPlayer[];
  bench: FootballLineupPlayer[];
  language: string;
}) {
  if (!starters.length) {
    return (
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-slate-700 dark:text-slate-200">{teamName}</p>
        <p className="mt-1 text-[11px] text-slate-400">{language === 'vi' ? 'Chưa có đội hình.' : 'No lineup yet.'}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-black text-slate-700 dark:text-slate-200">{teamName}</span>
        {formation && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {formation}
          </span>
        )}
      </div>
      <ul className="space-y-1 text-xs">
        {starters.map((player) => (
          <li key={player.id ?? player.name} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="w-5 shrink-0 text-center font-black text-slate-400">{player.shirtNumber ?? '-'}</span>
            <span className="min-w-0 truncate">{player.name}</span>
            {player.position && <span className="ml-auto shrink-0 text-[10px] text-slate-400">{player.position}</span>}
          </li>
        ))}
      </ul>
      {bench.length === 0 && null}
    </div>
  );
}

function BenchList({ teamName, players, language }: { teamName: string; players: FootballLineupPlayer[]; language: string }) {
  if (!players.length) return <div className="min-w-0" />;
  return (
    <div className="min-w-0">
      <p className="mb-1.5 truncate text-[11px] font-black text-slate-500 dark:text-slate-400">
        {teamName} · {language === 'vi' ? 'Dự bị' : 'Bench'}
      </p>
      <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        {players.map((player) => (
          <li key={player.id ?? player.name} className="truncate">
            {player.shirtNumber ?? '-'} · {player.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

type StatRowData = { key: string; vi: string; en: string; home: number | null; away: number | null; isPercent?: boolean };

function buildStatRows(
  home: Record<string, number> | null,
  away: Record<string, number> | null,
): StatRowData[] {
  const keys = new Set([...Object.keys(home || {}), ...Object.keys(away || {})]);
  const rows: StatRowData[] = [];
  for (const key of keys) {
    const label = STAT_LABELS[key];
    if (!label) continue;
    rows.push({
      key,
      vi: label.vi,
      en: label.en,
      home: home?.[key] ?? null,
      away: away?.[key] ?? null,
      isPercent: label.isPercent,
    });
  }
  return rows;
}

function StatRow({ label, home, away, isPercent }: { label: string; home: number | null; away: number | null; isPercent?: boolean }) {
  const homeValue = home ?? 0;
  const awayValue = away ?? 0;
  const total = homeValue + awayValue || 1;
  const homePct = (homeValue / total) * 100;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200">
        <span>{home != null ? `${home}${isPercent ? '%' : ''}` : '-'}</span>
        <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
        <span>{away != null ? `${away}${isPercent ? '%' : ''}` : '-'}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function OddsTiles({ odds, language }: { odds: FootballMatchOdds; language: string }) {
  const tiles = [
    { label: language === 'vi' ? 'Chủ thắng' : 'Home', value: odds.homeWin },
    { label: language === 'vi' ? 'Hòa' : 'Draw', value: odds.draw },
    { label: language === 'vi' ? 'Khách thắng' : 'Away', value: odds.awayWin },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/40">
          <div className="text-[10px] font-bold uppercase text-slate-400">{tile.label}</div>
          <div className="text-sm font-black text-slate-800 dark:text-slate-100">{tile.value.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

function DetailLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}
