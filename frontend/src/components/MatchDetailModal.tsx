'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiMapPin, FiUsers, FiHash, FiAlertCircle, FiDatabase } from 'react-icons/fi';
import { footballAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { useAsync } from '@/hooks/useAsync';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

type MatchDetailModalProps = {
  matchId: number;
  onClose: () => void;
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
    return JSON.stringify(value[0]).slice(0, 180);
  } catch {
    return null;
  }
}

export default function MatchDetailModal({ matchId, onClose }: MatchDetailModalProps) {
  const { language } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(true, onClose);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const { data, isLoading, error } = useAsync(
    () => footballAPI.getMatchDetail(matchId).then((res) => res.data),
    [matchId],
  );

  const stageLabel = data?.stage ? STAGE_LABEL[data.stage] : undefined;
  const hasHalfTime = data?.score.halfTime.home !== null && data?.score.halfTime.home !== undefined;
  const deepItems = data
    ? [
        { key: 'goals', vi: 'Bàn thắng', en: 'Goals', count: getDeepCount(data.deepData.goals), preview: previewDeepItem(data.deepData.goals) },
        { key: 'cards', vi: 'Thẻ', en: 'Cards', count: getDeepCount(data.deepData.cards), preview: previewDeepItem(data.deepData.cards) },
        { key: 'substitutions', vi: 'Thay người', en: 'Substitutions', count: getDeepCount(data.deepData.substitutions), preview: previewDeepItem(data.deepData.substitutions) },
        { key: 'lineups', vi: 'Đội hình', en: 'Lineups', count: getDeepCount(data.deepData.lineups), preview: previewDeepItem(data.deepData.lineups) },
        { key: 'statistics', vi: 'Thống kê', en: 'Statistics', count: getDeepCount(data.deepData.statistics), preview: previewDeepItem(data.deepData.statistics) },
        { key: 'odds', vi: 'Tỷ lệ', en: 'Odds', count: getDeepCount(data.deepData.odds), preview: previewDeepItem(data.deepData.odds) },
      ]
    : [];
  const hasDeepData = deepItems.some((item) => item.count > 0);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto no-scrollbar">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300 cursor-pointer"
        onClick={onClose}
      />

      {/* Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-detail-title"
        tabIndex={-1}
        className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border/80 overflow-hidden animate-in zoom-in-95 fade-in duration-300 my-auto z-10 outline-none"
      >
        <div className="relative p-6 bg-gradient-to-br from-emerald-600 to-teal-600 text-white text-center">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
          <div className="flex items-center justify-center gap-2">
            {data?.competitionEmblem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.competitionEmblem} alt="" className="w-6 h-6 object-contain" />
            )}
            <h2 id="match-detail-title" className="text-sm font-bold uppercase tracking-wide">
              {data?.competitionName || (language === 'vi' ? 'Đang tải...' : 'Loading...')}
            </h2>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error || !data ? (
            <p className="text-center text-slate-500 py-10 font-semibold">
              {language === 'vi' ? 'Không tải được chi tiết trận đấu.' : 'Failed to load match details.'}
            </p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  {data.homeTeam.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.homeTeam.crest} alt="" className="w-14 h-14 object-contain" />
                  )}
                  <span className="font-bold text-sm text-center text-slate-800 dark:text-slate-100 truncate w-full">
                    {data.homeTeam.name}
                  </span>
                </div>
                <div className="shrink-0 text-2xl font-black text-slate-700 dark:text-slate-200">
                  {data.score.fullTime.home ?? '–'} : {data.score.fullTime.away ?? '–'}
                </div>
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  {data.awayTeam.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.awayTeam.crest} alt="" className="w-14 h-14 object-contain" />
                  )}
                  <span className="font-bold text-sm text-center text-slate-800 dark:text-slate-100 truncate w-full">
                    {data.awayTeam.name}
                  </span>
                </div>
              </div>

              {hasHalfTime && (
                <p className="text-center text-xs text-slate-400 font-semibold">
                  {language === 'vi' ? 'Tỉ số hiệp 1' : 'Half-time'}: {data.score.halfTime.home} - {data.score.halfTime.away}
                </p>
              )}

              <div className="border-t border-border pt-4 space-y-2.5 text-sm">
                {data.matchday !== null && (
                  <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                    <FiHash className="shrink-0 text-slate-400" />
                    <span>{language === 'vi' ? `Vòng đấu ${data.matchday}` : `Matchday ${data.matchday}`}</span>
                  </div>
                )}
                {stageLabel && (
                  <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                    <FiHash className="shrink-0 text-slate-400" />
                    <span>{language === 'vi' ? stageLabel.vi : stageLabel.en}{data.group ? ` · ${data.group}` : ''}</span>
                  </div>
                )}
                {data.venue && (
                  <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                    <FiMapPin className="shrink-0 text-slate-400" />
                    <span>{data.venue}</span>
                  </div>
                )}
                {data.referees.length > 0 && (
                  <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                    <FiUsers className="shrink-0 text-slate-400" />
                    <span>{language === 'vi' ? 'Trọng tài: ' : 'Referee: '}{data.referees.join(', ')}</span>
                  </div>
                )}
                {data.matchday === null && !stageLabel && !data.venue && data.referees.length === 0 && (
                  <p className="text-center text-xs text-slate-400 font-semibold">
                    {language === 'vi'
                      ? 'Chưa có thêm thông tin cho trận đấu này.'
                      : 'No further details available for this match yet.'}
                  </p>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 font-semibold">
                  <FiAlertCircle className="mt-0.5 shrink-0" />
                  <span>{data.deepDataNotice}</span>
                </div>

                <div>
                  <div className="flex items-center gap-2 font-black text-sm text-slate-800 dark:text-slate-100 mb-2">
                    <FiDatabase className="text-slate-400" />
                    {language === 'vi' ? 'Dữ liệu chuyên sâu API trả về' : 'Deep data returned by API'}
                  </div>
                  {!hasDeepData ? (
                    <p className="text-xs text-slate-400 font-semibold">
                      {language === 'vi'
                        ? 'Response hiện tại chưa có lineup, thẻ, thay người, scorer chi tiết, stats hoặc odds.'
                        : 'This response does not include lineup, cards, substitutions, detailed scorers, stats or odds.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deepItems.filter((item) => item.count > 0).map((item) => (
                        <div key={item.key} className="rounded-xl border border-border bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                          <div className="text-xs font-black text-slate-700 dark:text-slate-200">
                            {language === 'vi' ? item.vi : item.en}: {item.count}
                          </div>
                          {item.preview && (
                            <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-500 font-mono">
                              {item.preview}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {data.deepData.rawAvailableKeys.length > 0 && (
                    <p className="mt-3 text-[11px] text-slate-400 font-semibold break-words">
                      {language === 'vi' ? 'Keys có trong response: ' : 'Response keys: '}
                      {data.deepData.rawAvailableKeys.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
