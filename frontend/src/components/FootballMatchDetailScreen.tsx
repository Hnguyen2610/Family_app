'use client';

import {
  FiArrowLeft,
  FiCheckCircle,
  FiDatabase,
  FiHash,
  FiMapPin,
  FiMinusCircle,
  FiRefreshCw,
  FiUsers,
} from 'react-icons/fi';
import { footballAPI, type FootballDeepFieldKey, type FootballMatchEnrichment } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { useAsync } from '@/hooks/useAsync';
import { cachedFootballRequest } from '@/lib/football-cache';

type FootballMatchDetailScreenProps = {
  matchId: number;
  onBack: () => void;
};

type DeepItem = {
  key: string;
  enrichmentKey?: FootballDeepFieldKey;
  vi: string;
  en: string;
  count: number;
  preview: string | null;
  noteVi?: string;
  noteEn?: string;
};

const STAGE_LABEL: Record<string, { vi: string; en: string }> = {
  REGULAR_SEASON: { vi: 'Mùa giải chính', en: 'Regular Season' },
  GROUP_STAGE: { vi: 'Vòng bảng', en: 'Group Stage' },
  LAST_16: { vi: 'Vòng 1/8', en: 'Round of 16' },
  QUARTER_FINALS: { vi: 'Tứ kết', en: 'Quarter-finals' },
  SEMI_FINALS: { vi: 'Bán kết', en: 'Semi-finals' },
  FINAL: { vi: 'Chung kết', en: 'Final' },
};

function getDeepCount(value?: unknown[]) {
  return Array.isArray(value) ? value.length : 0;
}

function previewDeepItem(value?: unknown[]) {
  if (!Array.isArray(value) || value.length === 0) return null;
  try {
    const visibleItems = value.slice(0, 5);
    const suffix = value.length > visibleItems.length ? `\n...and ${value.length - visibleItems.length} more` : '';
    return `${JSON.stringify(visibleItems.length === 1 ? visibleItems[0] : visibleItems, null, 2)}${suffix}`;
  } catch {
    return null;
  }
}

function previewLiveStatus(data: { status: string; utcDate: string }) {
  return JSON.stringify({
    status: data.status,
    utcDate: data.utcDate,
    realtime: 'not guaranteed on free plan',
  });
}

function getEnrichmentField(enrichment: FootballMatchEnrichment | null | undefined, field?: FootballDeepFieldKey) {
  return field ? enrichment?.fields?.[field] : undefined;
}

export default function FootballMatchDetailScreen({ matchId, onBack }: FootballMatchDetailScreenProps) {
  const { language } = useTranslation();
  const { data, isLoading, error, refetch } = useAsync(
    () => cachedFootballRequest(
      ['match-detail-enriched-v1', matchId],
      () => footballAPI.getMatchDetail(matchId).then((res) => res.data),
      20 * 60 * 1000,
    ),
    [matchId],
  );

  const stageLabel = data?.stage ? STAGE_LABEL[data.stage] : undefined;
  const hasHalfTime = data?.score.halfTime.home !== null && data?.score.halfTime.home !== undefined;
  const deepItems: DeepItem[] = data
    ? [
        {
          key: 'live',
          vi: 'Live/status',
          en: 'Live/status',
          count: data.status ? 1 : 0,
          preview: previewLiveStatus(data),
          noteVi: 'Trạng thái trận từ API; không đảm bảo realtime trên free plan.',
          noteEn: 'Match status from API; realtime updates are not guaranteed on the free plan.',
        },
        {
          key: 'events',
          enrichmentKey: 'events',
          vi: 'Sự kiện trận đấu',
          en: 'Match events',
          count: getDeepCount(data.deepData.rawEvents),
          preview: previewDeepItem(data.deepData.rawEvents),
          noteVi: 'Bao gồm bàn thắng, thẻ, thay người nếu provider trả về.',
          noteEn: 'Includes goals, cards and substitutions when the provider returns them.',
        },
        {
          key: 'goals',
          enrichmentKey: 'goals',
          vi: 'Bàn thắng/scorer',
          en: 'Goals/scorers',
          count: getDeepCount(data.deepData.goals),
          preview: previewDeepItem(data.deepData.goals),
        },
        { key: 'cards', enrichmentKey: 'cards', vi: 'Thẻ', en: 'Cards', count: getDeepCount(data.deepData.cards), preview: previewDeepItem(data.deepData.cards) },
        { key: 'substitutions', enrichmentKey: 'substitutions', vi: 'Thay người', en: 'Substitutions', count: getDeepCount(data.deepData.substitutions), preview: previewDeepItem(data.deepData.substitutions) },
        { key: 'lineups', enrichmentKey: 'lineups', vi: 'Đội hình/lineup', en: 'Lineups', count: getDeepCount(data.deepData.lineups), preview: previewDeepItem(data.deepData.lineups) },
        { key: 'statistics', enrichmentKey: 'statistics', vi: 'Thống kê trận', en: 'Match statistics', count: getDeepCount(data.deepData.statistics), preview: previewDeepItem(data.deepData.statistics) },
        { key: 'odds', vi: 'Odds/tỷ lệ', en: 'Odds', count: getDeepCount(data.deepData.odds), preview: previewDeepItem(data.deepData.odds) },
      ]
    : [];
  const hasProviderDeepData = deepItems.some((item) => item.key !== 'live' && item.count > 0);
  const hasWebEnrichment = Boolean(data?.enrichment?.filledFields?.length);
  const hasDeepData = hasProviderDeepData || hasWebEnrichment;

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
                <section>
                  <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                    <FiDatabase className="text-slate-400" />
                    {language === 'vi' ? 'Thông tin trận đấu' : 'Match information'}
                  </div>
                  {!hasDeepData && (
                    <p className="mb-3 text-xs font-semibold text-slate-400">
                      {language === 'vi'
                        ? 'Response hiện tại chưa có dữ liệu chuyên sâu ngoài trạng thái trận.'
                        : 'This response does not include deep data beyond match status.'}
                    </p>
                  )}
                  <div className="grid gap-3 lg:grid-cols-2">
                    {deepItems.map((item) => {
                      const providerAvailable = item.count > 0;
                      const enrichmentField = getEnrichmentField(data.enrichment, item.enrichmentKey);
                      const webAvailable = !providerAvailable && enrichmentField?.status === 'filled' && Boolean(enrichmentField.summary);
                      const available = providerAvailable || webAvailable;
                      const preview = item.preview || (webAvailable ? enrichmentField?.summary || null : null);
                      return (
                        <div
                          key={item.key}
                          className={`rounded-xl border px-3 py-3 ${
                            available
                              ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                              : 'border-border bg-slate-50 dark:bg-slate-900/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {available ? (
                                <FiCheckCircle className="shrink-0 text-emerald-600" />
                              ) : (
                                <FiMinusCircle className="shrink-0 text-slate-400" />
                              )}
                              <span className="truncate text-xs font-black text-slate-700 dark:text-slate-200">
                                {language === 'vi' ? item.vi : item.en}
                              </span>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                              available
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {available
                                ? language === 'vi' ? 'Có' : 'Available'
                                : language === 'vi' ? 'Chưa có' : 'Missing'}
                            </span>
                          </div>
                          {'noteVi' in item && (
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {language === 'vi' ? item.noteVi : item.noteEn}
                            </p>
                          )}
                          {preview && (
                            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-2 text-[11px] text-slate-500 font-mono dark:bg-slate-950/40">
                              {preview}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
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
