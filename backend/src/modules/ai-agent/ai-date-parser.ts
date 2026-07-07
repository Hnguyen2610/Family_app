import { normalizeSearchText } from './ai-intent-router';

export type ParsedDate = {
  iso: string;
  display: string;
  month: number;
  year: number;
};

export type ParsedDateRange = {
  start: ParsedDate;
  end: ParsedDate;
  dates: ParsedDate[];
};

function ictToday() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toParsedDate(year: number, month: number, day: number): ParsedDate {
  return {
    iso: toIsoDate(year, month, day),
    display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    month,
    year,
  };
}

function parsedDateFromUtcDate(date: Date): ParsedDate {
  return toParsedDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseSlashDateParts(dayText: string, monthText: string, yearText?: string): ParsedDate | undefined {
  const today = ictToday();
  const day = Number.parseInt(dayText, 10);
  const month = Number.parseInt(monthText, 10);
  const year = yearText ? Number.parseInt(yearText, 10) : today.year;
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;

  return toParsedDate(year, month, day);
}

function enumerateDateRange(start: ParsedDate, end: ParsedDate): ParsedDate[] {
  const startDate = new Date(`${start.iso}T00:00:00.000Z`);
  const endDate = new Date(`${end.iso}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
  if (endDate < startDate) return [];

  const dates: ParsedDate[] = [];
  for (const cursor = new Date(startDate); cursor <= endDate && dates.length < 32; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(parsedDateFromUtcDate(cursor));
  }

  return dates;
}

function addDays(days: number): ParsedDate {
  const now = Date.now() + 7 * 60 * 60 * 1000;
  return parsedDateFromUtcDate(new Date(now + days * 24 * 60 * 60 * 1000));
}

function parseWeekdayDate(normalized: string): ParsedDate | undefined {
  const match = normalized.match(/\b(?:thu\s*([2-7])|chu\s*nhat|sunday)\b/);
  if (!match) return undefined;

  const targetDay = match[1] ? Number.parseInt(match[1], 10) - 1 : 0;
  const todayIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const currentDay = todayIct.getUTCDay();
  let daysUntilTarget = targetDay - currentDay;

  if (normalized.includes('tuan sau') || normalized.includes('next week')) {
    daysUntilTarget += 7;
  } else if (!normalized.includes('tuan nay') && !normalized.includes('this week') && daysUntilTarget < 0) {
    daysUntilTarget += 7;
  }

  const targetDate = new Date(todayIct);
  targetDate.setUTCDate(todayIct.getUTCDate() + daysUntilTarget);
  return parsedDateFromUtcDate(targetDate);
}

export function parseCalendarDateRange(message: string): ParsedDateRange | undefined {
  const normalized = normalizeSearchText(message || '');
  const range = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:-|den|toi)\s*(?:ngay)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/i);
  if (!range) return undefined;

  const start = parseSlashDateParts(range[1], range[2], range[3] || range[6]);
  const end = parseSlashDateParts(range[4], range[5], range[6] || range[3]);
  if (!start || !end) return undefined;

  const dates = enumerateDateRange(start, end);
  if (dates.length < 2) return undefined;
  return { start, end, dates };
}

export function parseCalendarDate(message: string): ParsedDate | undefined {
  const normalized = normalizeSearchText(message || '');

  const iso = message.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return toParsedDate(Number.parseInt(iso[1], 10), Number.parseInt(iso[2], 10), Number.parseInt(iso[3], 10));
  }

  const slash = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (slash) return parseSlashDateParts(slash[1], slash[2], slash[3]);

  if (normalized.includes('ngay mai') || normalized.includes('tomorrow')) return addDays(1);
  if (normalized.includes('ngay mot') || normalized.includes('moi ngay kia')) return addDays(2);
  if (normalized.includes('hom nay') || normalized.includes('toi nay') || normalized.includes('today')) return addDays(0);

  return parseWeekdayDate(normalized);
}

export function parseCalendarTime(message: string): string | undefined {
  const normalized = normalizeSearchText(message || '');

  const clock = normalized.match(/\b(\d{1,2})\s*(?::|h)\s*(\d{2})\b/);
  if (clock) {
    const hour = Number.parseInt(clock[1], 10);
    const minute = Number.parseInt(clock[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const hourOnly = normalized.match(/\b(\d{1,2})\s*(?:gio|h)\b/);
  if (hourOnly) {
    let hour = Number.parseInt(hourOnly[1], 10);
    if (hour >= 1 && hour <= 12 && /\b(toi|dem)\b/.test(normalized)) hour += 12;
    if (hour >= 1 && hour <= 11 && /\b(chieu)\b/.test(normalized)) hour += 12;
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, '0')}:00`;
  }

  if (normalized.includes('toi nay')) return '19:00';
  return undefined;
}
