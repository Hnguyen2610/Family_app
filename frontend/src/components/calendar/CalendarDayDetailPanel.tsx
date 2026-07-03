import type { TranslationKey } from '@/lib/i18n';
import { FiArrowRight, FiClock, FiPlus } from 'react-icons/fi';
import { formatLunarDate, getLunarDate } from '@/utils/lunar';
import { isSameCalendarDate } from '@/utils/date';
import { getEventIcon } from './calendar-render-utils';

type CalendarDayDetailPanelProps = {
  events: any[];
  language: string;
  month: number;
  monthKey: TranslationKey;
  selectedDate: number;
  t: (key: TranslationKey) => string;
  year: number;
  onAddEvent: (day: number) => void;
  onEditEvent: (event: any) => void;
};

export function CalendarDayDetailPanel({
  events,
  language,
  month,
  monthKey,
  selectedDate,
  t,
  year,
  onAddEvent,
  onEditEvent,
}: CalendarDayDetailPanelProps) {
  const selectedEvents = events.filter((event) => isSameCalendarDate(event.date, year, month, selectedDate));

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500 p-10 rounded-2xl glass bg-white/60 dark:bg-slate-900/60 border border-black/5 dark:border-primary/30 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 dark:text-white">
        <FiClock size={120} />
      </div>
      <div className="relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/20 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-3">
              {t('nav.node')}
            </div>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic">
              {selectedDate} <span className="text-primary not-italic">{t(monthKey)}</span>
            </h3>
            {language === 'vi' && (
              <p className="text-primary font-black text-[10px] uppercase tracking-[0.2em] mt-3 opacity-60">
                {t('calendar.lunar')}: {formatLunarDate(getLunarDate(selectedDate, month, year))}
              </p>
            )}
          </div>
          <button onClick={() => onAddEvent(selectedDate)} className="btn-primary flex items-center gap-2">
            <FiPlus /> {t('calendar.addEvent')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {selectedEvents.length === 0 ? (
            <div className="col-span-full py-20 text-center glass-dark rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <FiClock className="text-slate-400 dark:text-slate-800 text-4xl mx-auto mb-4" />
              <p className="text-[10px] text-slate-500 dark:text-slate-600 font-black uppercase tracking-widest">
                {t('calendar.noEvents')}
              </p>
            </div>
          ) : (
            selectedEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => onEditEvent(event)}
                className="p-6 rounded-xl bg-slate-100 dark:bg-slate-900 border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all cursor-pointer group/item relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                  <FiArrowRight size={14} className="text-primary" />
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-black/5 dark:border-white/5 flex items-center justify-center text-primary text-xl">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-base truncate">{event.title}</h4>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border border-black/5 dark:border-white/5 uppercase tracking-tighter">
                        {event.familyName || 'System'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">
                      <FiClock className="text-primary" /> {event.time || '00:00'} // {event.type}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
