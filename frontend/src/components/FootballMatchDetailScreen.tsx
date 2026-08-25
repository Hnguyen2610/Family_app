'use client';

import type { ReactNode } from 'react';
import {
  FiArrowLeft,
  FiDatabase,
  FiHash,
  FiMapPin,
  FiRefreshCw,
  FiUsers,
} from 'react-icons/fi';
import {
  footballAPI,
  type FootballLineupPlayer,
  type FootballMatchDetail,
  type FootballMatchEnrichment,
  type FootballMatchOdds,
  type FootballMatchSide,
} from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { useAsync } from '@/hooks/useAsync';
import { cachedFootballRequest } from '@/lib/football-cache';

type FootballMatchDetailScreenProps = {
  matchId: number;
  onBack: () => void;
};

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

const ENRICHMENT_FIELD_LABEL: Record<string, { vi: string; en: string }> = {
  goals: { vi: 'Bàn thắng', en: 'Goals' },
  cards: { vi: 'Thẻ phạt', en: 'Cards' },
  substitutions: { vi: 'Thay người', en: 'Substitutions' },
  lineups: { vi: 'Đội hình', en: 'Lineups' },
  statistics: { vi: 'Thống kê', en: 'Statistics' },
};

type TimelineEvent = {
  key: string;
  minute: number | null;
  injuryTime?: number | null;
  side: FootballMatchSide;
  icon: string;
  text: string;
};

function buildTimeline(deepData: FootballMatchDetail['deepData']): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  deepData.goals.forEach((goal, index) => {
    const tag = goal.type === 'PENALTY' ? ' (phạt đền)' : goal.type === 'OWN' ? ' (phản lưới nhà)' : '';
    events.push({
      key: `goal-${index}`,
      minute: goal.minute,
      injuryTime: goal.injuryTime,
      side: goal.side,
      icon: '⚽',
      text: `${goal.scorer || 'Bàn thắng'}${tag}${goal.assist ? ` · kiến tạo: ${goal.assist}` : ''}`,
    });
  });

  deepData.bookings.forEach((booking, index) => {
    events.push({
      key: `booking-${index}`,
      minute: booking.minute,
      side: booking.side,
      icon: booking.card === 'RED' || booking.card === 'YELLOW_RED' ? '🟥' : '🟨',
      text: booking.player || 'Thẻ phạt',
    });
  });

  deepData.substitutions.forEach((sub, index) => {
    events.push({
      key: `sub-${index}`,
      minute: sub.minute,
      side: sub.side,
      icon: '🔁',
      text: `${sub.playerIn || '?'} thay ${sub.playerOut || '?'}`,
    });
  });

  return events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
}

function cleanEnrichmentSummary(summary: string): string {
  return summary
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !line.startsWith('|') && !/^\[.*\]\(.*\)$/.test(line))
    .join('\n');
}

export default function FootballMatchDetailScreen({ matchId, onBack }: FootballMatchDetailScreenProps) {
  const { language } = useTranslation();
  const { data, isLoading, error, refetch } = useAsync(
    () => cachedFootballRequest(
      ['match-detail-v3', matchId],
      () => footballAPI.getMatchDetail(matchId).then((res) => res.data),
      20 * 60 * 1000,
    ),
    [matchId],
  );

  const stageLabel = data?.stage ? STAGE_LABEL[data.stage] : undefined;
  const hasHalfTime = data?.score.halfTime.home !== null && data?.score.halfTime.home !== undefined;

  const timeline = data ? buildTimeline(data.deepData) : [];
  const hasLineups = Boolean(data && (data.deepData.homeLineup.length > 0 || data.deepData.awayLineup.length > 0));
  const statRows = data ? buildStatRows(data.deepData.homeStatistics, data.deepData.awayStatistics) : [];
  const odds = data?.deepData.odds || null;
  const hasDeepData = timeline.length > 0 || hasLineups || statRows.length > 0 || Boolean(odds);
  const enrichmentNotes = data ? buildEnrichmentNotes(data.enrichment) : [];

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
            <div className="space-y-6">
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

              <div className="border-t border-border pt-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                  <FiDatabase className="text-slate-400" />
                  {language === 'vi' ? 'Thông tin trận đấu' : 'Match information'}
                </div>

                {!hasDeepData && (
                  <p className="text-xs font-semibold text-slate-400">
                    {language === 'vi'
                      ? 'Chưa có dữ liệu chuyên sâu (sự kiện/đội hình/thống kê/odds) cho trận này — gói free của football-data.org thường không trả cho đa số trận.'
                      : 'No deep data (events/lineups/stats/odds) for this match yet — the football-data.org free plan usually doesn\'t return it.'}
                  </p>
                )}

                {timeline.length > 0 && (
                  <MatchInfoCard title={language === 'vi' ? 'Diễn biến trận đấu' : 'Match events'}>
                    <MatchTimeline events={timeline} />
                  </MatchInfoCard>
                )}

                {hasLineups && (
                  <MatchInfoCard title={language === 'vi' ? 'Đội hình ra sân' : 'Lineups'}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <LineupColumn
                        teamName={data.homeTeam.name}
                        formation={data.deepData.homeFormation}
                        starters={data.deepData.homeLineup}
                        bench={data.deepData.homeBench}
                        language={language}
                      />
                      <LineupColumn
                        teamName={data.awayTeam.name}
                        formation={data.deepData.awayFormation}
                        starters={data.deepData.awayLineup}
                        bench={data.deepData.awayBench}
                        language={language}
                      />
                    </div>
                  </MatchInfoCard>
                )}

                {statRows.length > 0 && (
                  <MatchInfoCard title={language === 'vi' ? 'Thống kê trận đấu' : 'Match statistics'}>
                    <div className="space-y-3">
                      {statRows.map((row) => (
                        <StatRow key={row.key} label={language === 'vi' ? row.vi : row.en} home={row.home} away={row.away} isPercent={row.isPercent} />
                      ))}
                    </div>
                  </MatchInfoCard>
                )}

                {odds && (
                  <MatchInfoCard title={language === 'vi' ? 'Tỷ lệ cược' : 'Odds'}>
                    <OddsTiles odds={odds} language={language} />
                  </MatchInfoCard>
                )}

                {enrichmentNotes.length > 0 && (
                  <details className="rounded-xl border border-border bg-slate-50/60 dark:bg-slate-900/30 px-3 py-2.5">
                    <summary className="cursor-pointer text-xs font-bold text-slate-500">
                      {language === 'vi'
                        ? `Thông tin bổ sung tìm trên web (${enrichmentNotes.length}, không đảm bảo chính xác)`
                        : `Extra info found on the web (${enrichmentNotes.length}, not guaranteed accurate)`}
                    </summary>
                    <div className="mt-2 space-y-3">
                      {enrichmentNotes.map((note) => (
                        <div key={note.key}>
                          <p className="text-[11px] font-black uppercase text-slate-400">{language === 'vi' ? note.vi : note.en}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">{note.text}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchInfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2.5 text-xs font-black uppercase text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function MatchTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="space-y-1.5">
      {events.map((event) => {
        const minuteLabel = event.minute != null ? `${event.minute}${event.injuryTime ? `+${event.injuryTime}` : ''}'` : '';
        return (
          <div key={event.key} className="grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)] items-center gap-2 text-xs sm:text-sm">
            <div className="min-w-0 truncate text-right font-semibold text-slate-700 dark:text-slate-200">
              {event.side === 'HOME' && `${event.icon} ${event.text}`}
              {event.side === null && `${event.icon} ${event.text}`}
            </div>
            <div className="text-center text-[11px] font-black tabular-nums text-slate-400">{minuteLabel}</div>
            <div className="min-w-0 truncate text-left font-semibold text-slate-700 dark:text-slate-200">
              {event.side === 'AWAY' && `${event.icon} ${event.text}`}
            </div>
          </div>
        );
      })}
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
      {bench.length > 0 && (
        <details className="mt-2 text-[11px] text-slate-400">
          <summary className="cursor-pointer font-semibold">
            {language === 'vi' ? `Dự bị (${bench.length})` : `Bench (${bench.length})`}
          </summary>
          <ul className="mt-1 space-y-1 pl-1">
            {bench.map((player) => (
              <li key={player.id ?? player.name} className="truncate">
                {player.shirtNumber ?? '-'} · {player.name}
              </li>
            ))}
          </ul>
        </details>
      )}
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

type EnrichmentNote = { key: string; vi: string; en: string; text: string };

function buildEnrichmentNotes(enrichment: FootballMatchEnrichment | null | undefined): EnrichmentNote[] {
  if (!enrichment?.filledFields?.length) return [];
  const notes: EnrichmentNote[] = [];
  for (const field of enrichment.filledFields) {
    const summary = enrichment.fields?.[field]?.summary;
    if (!summary) continue;
    const cleaned = cleanEnrichmentSummary(summary);
    if (!cleaned) continue;
    const label = ENRICHMENT_FIELD_LABEL[field] || { vi: field, en: field };
    notes.push({ key: field, vi: label.vi, en: label.en, text: cleaned });
  }
  return notes;
}

function DetailLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}
