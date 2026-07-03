import { format } from 'date-fns';
import { FiCalendar, FiCheck, FiClock, FiGift, FiStar } from 'react-icons/fi';

export function getIsoDateRange(startDate: string, endDate?: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < 32) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

export function getEventIcon(type: string) {
  switch (type) {
    case 'BIRTHDAY':
      return <FiGift size={12} />;
    case 'ANNIVERSARY':
    case 'HOLIDAY':
      return <FiStar size={12} />;
    case 'TASK':
    case 'WORK':
      return <FiCheck size={12} />;
    case 'APPOINTMENT':
      return <FiClock size={12} />;
    default:
      return <FiCalendar size={12} />;
  }
}

export function getMobileEventLabel(event: any) {
  const title = String(event.title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (!title) return event.time || 'Event';
  return title.length > 10 ? `${title.slice(0, 10)}...` : title;
}

export function getDayStyles(day: number | null, isSelected: boolean, isTodayDate: boolean) {
  if (!day) return 'bg-transparent border-transparent opacity-0 pointer-events-none';

  let styles = 'cursor-pointer ';
  if (isSelected) {
    styles += 'bg-primary/10 dark:bg-slate-800 border-primary shadow-lg md:shadow-xl z-10 md:scale-[1.02] shadow-primary/5';
  } else if (isTodayDate) {
    styles += 'bg-primary/5 border-primary/20 bg-white/40 dark:bg-primary/5';
  } else {
    styles += 'bg-white dark:bg-slate-900/40 border-black/5 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-black/20 dark:hover:border-white/10 shadow-sm';
  }
  return styles;
}

export function getEventStyles(eventType: string) {
  if (eventType === 'BIRTHDAY') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
  if (eventType === 'IMPORTANT') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return 'bg-primary/10 text-primary border-primary/20';
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
