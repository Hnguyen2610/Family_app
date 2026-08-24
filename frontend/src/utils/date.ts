const CALENDAR_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Shared vi/en locale pick for toLocaleDateString/toLocaleTimeString call sites across the app. */
export function getDateLocale(language?: string): string {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

export function formatDate(date: Date | string): string {
  return getCalendarDateKey(date);
}

export function formatDisplayDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function isToday(date: Date | string): boolean {
  return getCalendarDateKey(date) === getCalendarDateKey(new Date());
}

export function getCalendarDateKey(date: Date | string): string {
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function isSameCalendarDate(date: Date | string, year: number, month: number, day: number): boolean {
  return getCalendarDateKey(date) === `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatCalendarDayMonth(date: Date | string): string {
  const [, month, day] = getCalendarDateKey(date).split('-');
  return `${day}/${month}`;
}

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function getFirstDayOfMonth(month: number, year: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function getCalendarDays(month: number, year: number) {
  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);
  const days = [];

  // Empty cells before the first day
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return days;
}

export const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const vietnameseMonths = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];
