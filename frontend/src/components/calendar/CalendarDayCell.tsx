import { FiPlus } from 'react-icons/fi';
import { formatLunarDate, getLunarDate } from '@/utils/lunar';
import { isToday } from '@/utils/date';
import {
  getDayStyles,
  getEventIcon,
  getEventStyles,
  getMobileEventLabel,
} from './calendar-render-utils';

type CalendarDayCellProps = {
  day: number | null;
  dayEvents: any[];
  isSelected: boolean;
  language: string;
  month: number;
  year: number;
  onAddEvent: (day: number) => void;
  onEditEvent: (event: any) => void;
  onSelectDay: (day: number) => void;
};

export function CalendarDayCell({
  day,
  dayEvents,
  isSelected,
  language,
  month,
  year,
  onAddEvent,
  onEditEvent,
  onSelectDay,
}: CalendarDayCellProps) {
  const isTodayDate = day ? isToday(new Date(year, month - 1, day)) : false;

  return (
    <div
      onClick={() => day && onSelectDay(day)}
      className={`min-h-[88px] md:min-h-[160px] p-2 md:p-4 rounded-2xl md:rounded-xl border transition-all duration-300 md:duration-500 relative group/day ${getDayStyles(day, isSelected, !!isTodayDate)}`}
    >
      {day && (
        <>
          <div className="flex justify-between items-start">
            <div className="flex flex-col min-w-0">
              <span className={`text-base md:text-xl font-black leading-none ${isTodayDate ? 'text-primary' : 'text-slate-700 dark:text-slate-300'}`}>
                {day}
              </span>
              {language === 'vi' && (
                <span className="mt-1 text-[7px] md:text-[9px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-tighter">
                  {formatLunarDate(getLunarDate(day, month, year))}
                </span>
              )}
            </div>

            <button
              onClick={(event) => {
                event.stopPropagation();
                onAddEvent(day);
              }}
              className="hidden md:flex w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 items-center justify-center opacity-0 group-hover/day:opacity-100 transition-all hover:bg-primary hover:text-primary-foreground border border-black/5 dark:border-white/5"
            >
              <FiPlus size={14} />
            </button>
          </div>

          <div className="mt-2 md:mt-4 space-y-1 md:space-y-2 overflow-hidden">
            {dayEvents.slice(0, 2).map((event) => (
              <div
                key={event.id}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onEditEvent(event);
                }}
                className={`min-h-[16px] md:h-auto px-1 md:px-2 py-0.5 md:py-1.5 rounded-md md:rounded-lg text-[7px] md:text-[9px] font-black truncate border transition-all hover:scale-105 ${getEventStyles(event.type)}`}
                title={event.title}
              >
                <span className="md:hidden block leading-none truncate">
                  {getMobileEventLabel(event)}
                </span>
                <span className="hidden md:flex items-center gap-1.5 uppercase tracking-tighter">
                  {getEventIcon(event.type)}
                  {event.title}
                </span>
              </div>
            ))}
            {dayEvents.length > 2 && (
              <p className="text-[7px] md:text-[8px] font-black text-slate-500 dark:text-slate-600 text-center uppercase tracking-widest pt-0.5 md:pt-1">
                + {dayEvents.length - 2} {language === 'vi' ? 'Su kien' : 'Ledger Entries'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
