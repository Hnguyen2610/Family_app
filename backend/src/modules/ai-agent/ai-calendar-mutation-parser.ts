import { normalizeSearchText } from './ai-intent-router';

export type CalendarMutationAction = 'create' | 'update' | 'delete';

export type ParsedCalendarMutation = {
  action: CalendarMutationAction;
  args: Record<string, any>;
  lookup?: {
    title?: string;
    date?: string;
    month?: number;
    year?: number;
  };
  reason: string;
  needsClarification?: string;
};

type ParsedDate = {
  iso: string;
  display: string;
  month: number;
  year: number;
};

type ParsedDateRange = {
  start: ParsedDate;
  end: ParsedDate;
  dates: ParsedDate[];
};

const CREATE_SIGNALS = [
  'tao',
  'them',
  'len lich',
  'dat lich',
  'nhac',
  'schedule',
  'create event',
  'add event',
];

const UPDATE_SIGNALS = ['sua', 'cap nhat', 'doi', 'update'];
const DELETE_SIGNALS = ['xoa', 'huy', 'delete', 'remove'];
const EVENT_SIGNALS = ['lich', 'su kien', 'event', 'birthday', 'sinh nhat', 'hen', 'anniversary', 'ky niem', 'nhac'];

function hasAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

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

function parseSlashDateParts(dayText: string, monthText: string, yearText?: string): ParsedDate | undefined {
  const today = ictToday();
  const day = Number.parseInt(dayText, 10);
  const month = Number.parseInt(monthText, 10);
  const year = yearText ? Number.parseInt(yearText, 10) : today.year;
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;

  return {
    iso: toIsoDate(year, month, day),
    display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    month,
    year,
  };
}

function enumerateDateRange(start: ParsedDate, end: ParsedDate): ParsedDate[] {
  const startDate = new Date(`${start.iso}T00:00:00.000Z`);
  const endDate = new Date(`${end.iso}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
  if (endDate < startDate) return [];

  const dates: ParsedDate[] = [];
  for (const cursor = new Date(startDate); cursor <= endDate && dates.length < 32; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    dates.push({
      iso: toIsoDate(year, month, day),
      display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      month,
      year,
    });
  }

  return dates;
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

function addDays(days: number): ParsedDate {
  const now = Date.now() + 7 * 60 * 60 * 1000;
  const date = new Date(now + days * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    iso: toIsoDate(year, month, day),
    display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    month,
    year,
  };
}

export function parseCalendarDate(message: string): ParsedDate | undefined {
  const today = ictToday();
  const normalized = normalizeSearchText(message || '');

  const iso = message.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    const day = Number.parseInt(iso[3], 10);
    return {
      iso: toIsoDate(year, month, day),
      display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      month,
      year,
    };
  }

  const slash = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (slash) {
    return parseSlashDateParts(slash[1], slash[2], slash[3]);
  }

  if (normalized.includes('ngay mai') || normalized.includes('tomorrow')) return addDays(1);
  if (normalized.includes('ngay mot') || normalized.includes('moi ngay kia')) return addDays(2);
  if (normalized.includes('hom nay') || normalized.includes('toi nay') || normalized.includes('today')) return addDays(0);

  return undefined;
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

function parseScope(normalized: string): 'PRIVATE' | 'FAMILY' {
  if (/\b(private|rieng|ca nhan|cua toi)\b/.test(normalized)) return 'PRIVATE';
  return 'FAMILY';
}

function parseRecurring(normalized: string) {
  if (/\b(hang nam|moi nam|yearly|anniversary)\b/.test(normalized)) return 'YEARLY';
  if (/\b(hang thang|moi thang|monthly)\b/.test(normalized)) return 'MONTHLY';
  if (/\b(hang tuan|moi tuan|weekly)\b/.test(normalized)) return 'WEEKLY';
  return 'NONE';
}

function parseEventType(normalized: string) {
  if (normalized.includes('sinh nhat') || normalized.includes('birthday')) return 'BIRTHDAY';
  if (normalized.includes('ky niem') || normalized.includes('anniversary')) return 'ANNIVERSARY';
  if (normalized.includes('hen') || normalized.includes('appointment')) return 'APPOINTMENT';
  if (normalized.includes('task') || normalized.includes('viec') || normalized.includes('nhac')) return 'TASK';
  return 'GENERAL';
}

function extractEventId(message: string) {
  const explicit = message.match(/\b(?:id|eventId|event id)\s*[:=]?\s*([a-z0-9_-]{8,})\b/i);
  if (explicit) return explicit[1];
  const cuid = message.match(/\bcm[a-z0-9]{10,}\b/i);
  return cuid?.[0];
}

function extractExplicitTitle(message: string) {
  const markers = [
    /(?:v(?:o|\u1edb)i\s+)?(?:title|tieu\s*de|ti\u00eau\s*\u0111\u1ec1)\s*(?:(?:la|l\u00e0)\s+|[:\uff1a]\s*)?/iu,
    /(?:v(?:o|\u1edb)i\s+)?(?:ten\s+su\s+kien|t\u00ean\s+s\u1ef1\s+ki\u1ec7n|ten\s+lich|t\u00ean\s+l\u1ecbch)\s*(?:(?:la|l\u00e0)\s+|[:\uff1a]\s*)?/iu,
  ];

  for (const marker of markers) {
    const match = marker.exec(message);
    if (!match || match.index === undefined) continue;

    const rest = message.slice(match.index + match[0].length);
    const stop = rest.search(/\s+(?:ngay|ng\u00e0y|vao|v\u00e0o|luc|l\u00fac|scope|pham\s*vi|ph\u1ea1m\s*vi)\b|[.\n]/iu);
    const title = (stop >= 0 ? rest.slice(0, stop) : rest)
      .replace(/^[\s"']+|[\s"']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (title) return title;
  }

  return undefined;
}

function stripCommonEventWords(value: string) {
  return value
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\s*(?:-|den|d[eế]n|đến|toi|t[oớ]i|tới)\s*(?:ngay|ng[aà]y|ngày)?\s*\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/gi, ' ')
    .replace(/\b(?:ngay|ngày)\s+\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g, ' ')
    .replace(/\b(?:hom nay|hôm nay|ngay mai|ngày mai|ngay mot|ngày mốt|toi nay|tối nay|today|tomorrow)\b/gi, ' ')
    .replace(/\b(?:ngay|ngày)\b/gi, ' ')
    .replace(/\b(?:luc|lúc|vao luc|vào lúc)\s*\d{1,2}\s*(?::|h|gio|giờ)?\s*\d{0,2}\s*(?:sang|sáng|chieu|chiều|toi|tối|dem|đêm)?/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:gio|giờ|h)\s*(?:sang|sáng|chieu|chiều|toi|tối|dem|đêm)?/gi, ' ')
    .replace(/\b(?:tao|tạo|them|thêm|len lich|lên lịch|dat lich|đặt lịch|nhac|nhắc|sua|sửa|cap nhat|cập nhật|doi|đổi|xoa|xóa|huy|hủy|delete|remove|update|schedule)\b/gi, ' ')
    .replace(/\b(?:giup toi|giúp tôi|ca nhan|cá nhân|cua toi|của tôi)\b/gi, ' ')
    .replace(/\b(?:lich|lịch|su kien|sự kiện|event|calendar)\b/gi, ' ')
    .replace(/\s+(?:o|ở|cho)\s+(?:gia dinh|gia đình|family).*/gi, ' ')
    .replace(/\s+(?:scope|pham vi|phạm vi).*/gi, ' ')
    .replace(/^(?:den|đến|toi|tới|di|đi)\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEADING_TITLE_FILLERS = [
  'giup toi',
  'tao',
  'them',
  'len lich',
  'dat lich',
  'nhac',
  'lich',
  'su kien',
  'event',
  'calendar',
  'ca nhan',
  'cua toi',
  'den',
  'toi',
  'di',
  'ngay',
];

function stripLeadingFillerWords(value: string) {
  let title = value.trim();
  let changed = true;

  while (title && changed) {
    changed = false;
    const words = title.split(/\s+/);

    for (const filler of LEADING_TITLE_FILLERS) {
      const fillerWordCount = filler.split(/\s+/).length;
      const candidate = words.slice(0, fillerWordCount).join(' ');
      if (normalizeSearchText(candidate) === filler) {
        title = words.slice(fillerWordCount).join(' ').trim();
        changed = true;
        break;
      }
    }
  }

  return title;
}

function extractTitle(message: string) {
  const explicit = extractExplicitTitle(message);
  if (explicit) return explicit;
  const beforeNewValue = message.split(/\b(?:thanh|thành|doi thanh|đổi thành|sang)\b/i)[0] || message;
  return stripLeadingFillerWords(stripCommonEventWords(beforeNewValue));
}

function extractUpdatedTitle(message: string) {
  const match = message.match(/\b(?:thanh|thành|doi thanh|đổi thành)\s+([^.\n]+)$/i);
  if (!match) return undefined;
  const title = stripCommonEventWords(match[1]);
  return title || undefined;
}

function extractUpdatedDate(message: string) {
  const match = message.match(/\b(?:sang|doi sang|đổi sang|thanh ngay|thành ngày)\s+([^.\n]+)$/i);
  return match ? parseCalendarDate(match[1]) : undefined;
}

export function parseCalendarMutation(userMessage: string, resolvedFamilyId?: string): ParsedCalendarMutation | undefined {
  const message = userMessage || '';
  const normalized = normalizeSearchText(message).trim();
  if (!normalized || !hasAny(normalized, EVENT_SIGNALS)) return undefined;

  const dateRange = parseCalendarDateRange(message);
  const date = dateRange?.start || parseCalendarDate(message);
  const time = parseCalendarTime(message);
  const scope = parseScope(normalized);
  const recurring = parseRecurring(normalized);
  const type = parseEventType(normalized);
  const eventId = extractEventId(message);

  if (hasAny(normalized, CREATE_SIGNALS)) {
    if (!resolvedFamilyId && scope === 'FAMILY') {
      return {
        action: 'create',
        args: {},
        reason: 'create_missing_family',
        needsClarification: 'Ban muon tao su kien nay trong gia dinh nao?',
      };
    }
    if (!date) {
      return {
        action: 'create',
        args: {},
        reason: 'create_missing_date',
        needsClarification: 'Ban muon tao su kien vao ngay nao?',
      };
    }

    const title = extractTitle(message) || 'Su kien';
    return {
      action: 'create',
      args: {
        title,
        description: '',
        date: date.iso,
        dateList: dateRange?.dates.map((item) => item.iso),
        endDate: dateRange?.end.iso,
        time: time || '09:00',
        scope,
        type,
        isRecurring: recurring !== 'NONE',
        recurring,
        familyId: scope === 'FAMILY' ? resolvedFamilyId : undefined,
      },
      lookup: { title, date: date.iso, month: date.month, year: date.year },
      reason: dateRange ? 'deterministic_create_range' : 'deterministic_create',
    };
  }

  if (hasAny(normalized, DELETE_SIGNALS)) {
    const title = extractTitle(message);
    return {
      action: 'delete',
      args: eventId ? { id: eventId, familyId: resolvedFamilyId } : {},
      lookup: { title, date: date?.iso, month: date?.month, year: date?.year },
      reason: eventId ? 'deterministic_delete_by_id' : 'deterministic_delete_lookup',
      needsClarification: !eventId && (!title || !date) ? 'Ban muon xoa su kien nao? Hay gui ten su kien kem ngay.' : undefined,
    };
  }

  if (hasAny(normalized, UPDATE_SIGNALS)) {
    const title = extractTitle(message);
    const updatedDate = extractUpdatedDate(message);
    const updatedTitle = extractUpdatedTitle(message);
    const args: Record<string, any> = eventId ? { id: eventId, familyId: resolvedFamilyId } : {};
    if (updatedDate) args.date = updatedDate.iso;
    if (time) args.time = time;
    if (updatedTitle) args.title = updatedTitle;

    return {
      action: 'update',
      args,
      lookup: { title, date: date?.iso, month: date?.month, year: date?.year },
      reason: eventId ? 'deterministic_update_by_id' : 'deterministic_update_lookup',
      needsClarification: !eventId && (!title || !date)
        ? 'Ban muon sua su kien nao? Hay gui ten su kien kem ngay.'
        : undefined,
    };
  }

  return undefined;
}
