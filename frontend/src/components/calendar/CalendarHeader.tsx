import type { TranslationKey } from '@/lib/i18n';
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

type CalendarHeaderProps = {
  monthKey: TranslationKey;
  t: (key: TranslationKey) => string;
  year: number;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onToday: () => void;
};

export function CalendarHeader({
  monthKey,
  t,
  year,
  onNextMonth,
  onPreviousMonth,
  onToday,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 border-b border-border pb-4 md:pb-6">
      <div className="flex items-center gap-4 md:gap-6">
        <div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary items-center justify-center text-2xl">
          <FiCalendar />
        </div>
        <div>
          <div className="hidden sm:inline-flex items-center gap-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-semibold mb-2">
            {t('nav.calendarFull')}
          </div>
          <h2 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight capitalize pb-1 leading-[1.1]">
            {t(monthKey)} <span className="text-primary">{year}</span>
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex w-full sm:w-auto bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 p-1 rounded-xl shadow-sm">
          <button
            onClick={onPreviousMonth}
            className="p-2.5 md:p-3 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg transition-all text-slate-600 dark:text-slate-500 hover:text-primary hover:border-primary/30"
          >
            <FiChevronLeft size={18} />
          </button>
          <button
            onClick={onToday}
            className="flex-1 sm:flex-none px-5 md:px-6 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-primary transition-all"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={onNextMonth}
            className="p-2.5 md:p-3 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg transition-all text-slate-600 dark:text-slate-500 hover:text-primary hover:border-primary/30"
          >
            <FiChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
