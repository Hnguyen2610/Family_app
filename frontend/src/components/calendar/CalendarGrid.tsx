import type { TranslationKey } from '@/lib/i18n';
import { isEventOnCalendarDay } from './calendar-render-utils';
import { CalendarDayCell } from './CalendarDayCell';

type CalendarGridProps = {
  dayKeys: TranslationKey[];
  days: Array<number | null>;
  events: any[];
  language: string;
  month: number;
  selectedDate: number | null;
  t: (key: TranslationKey) => string;
  year: number;
  onAddEvent: (day: number) => void;
  onEditEvent: (event: any) => void;
  onSelectDay: (day: number) => void;
};

export function CalendarGrid({
  dayKeys,
  days,
  events,
  language,
  month,
  selectedDate,
  t,
  year,
  onAddEvent,
  onEditEvent,
  onSelectDay,
}: CalendarGridProps) {
  return (
    <div className="relative group rounded-2xl bg-white/80 dark:bg-slate-950/30 p-2 md:p-0 shadow-sm md:shadow-none border border-border md:border-0">
      <div className="grid grid-cols-7 gap-1.5 md:gap-4">
        {dayKeys.map((dayKey) => (
          <div key={dayKey} className="pb-1.5 md:pb-4 text-center text-[9px] md:text-xs font-semibold text-slate-500">
            {t(dayKey)}
          </div>
        ))}

        {days.map((day, index) => {
          const dayKey = day ? `day-${year}-${month}-${day}` : `padding-${index}`;
          const dayEvents = day ? events.filter((event) => isEventOnCalendarDay(event, year, month, day)) : [];

          return (
            <CalendarDayCell
              key={dayKey}
              day={day}
              dayEvents={dayEvents}
              isSelected={selectedDate === day}
              language={language}
              month={month}
              year={year}
              onAddEvent={onAddEvent}
              onEditEvent={onEditEvent}
              onSelectDay={onSelectDay}
            />
          );
        })}
      </div>
    </div>
  );
}
