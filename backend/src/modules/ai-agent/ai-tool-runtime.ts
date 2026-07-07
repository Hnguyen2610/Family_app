export type StructuredToolResult<T = any> = {
  ok: boolean;
  tool: string;
  data?: T;
  error?: {
    message: string;
  };
};

export type ToolValidationResult = {
  ok: boolean;
  errors: string[];
};

type ToolSchema = {
  function?: {
    name?: string;
    parameters?: {
      properties?: Record<string, any>;
      required?: string[];
    };
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toolSuccess<T>(tool: string, data: T): StructuredToolResult<T> {
  return { ok: true, tool, data };
}

export function toolError(tool: string, message: string): StructuredToolResult {
  return {
    ok: false,
    tool,
    error: { message },
  };
}

export function formatGoldPriceForUser(result: any): string {
  if (result?.error) {
    return result.message || 'Không thể lấy dữ liệu giá vàng lúc này.';
  }

  const summary = result?.formatted_summary || 'Không có dữ liệu giá vàng.';
  const source = result?.source ? `\n\nNguồn: ${result.source}` : '';
  const time = result?.api_time || result?.fetch_timestamp;

  return `${summary}${source}${time ? `\nCập nhật: ${time}` : ''}`;
}

export function formatMenuForUser(result: any): string {
  if (result?.error) {
    return result.message || 'Không thể tạo thực đơn lúc này.';
  }

  if (typeof result === 'string') return result;

  const parts = [];
  if (result?.mainDish) parts.push(`Món chính: ${formatMealName(result.mainDish)}`);
  if (result?.vegetable) parts.push(`Rau: ${formatMealName(result.vegetable)}`);
  if (result?.soup) parts.push(`Canh: ${formatMealName(result.soup)}`);
  if (result?.formatted) parts.push(result.formatted);

  return parts.length ? parts.join('\n') : JSON.stringify(result, null, 2);
}

function formatMealName(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.title || value.meal?.name || JSON.stringify(value);
}

export function formatCalendarEventsForUser(events: any[], month: number, year: number): string {
  if (!Array.isArray(events) || events.length === 0) {
    return `Không có sự kiện nào trong tháng ${month}/${year}.`;
  }

  const sorted = [...events].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return aTime - bTime;
  });

  const lines = sorted.slice(0, 12).map((event, index) => {
    const date = event?.date ? new Date(event.date) : undefined;
    const dateText = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('vi-VN')
      : 'Chưa rõ ngày';
    const timeText = event?.time ? ` ${event.time}` : '';
    const familyText = event?.familyName ? ` - ${event.familyName}` : '';
    return `${index + 1}. ${dateText}${timeText}: ${event?.title || 'Sự kiện'}${familyText}`;
  });

  const hiddenCount = sorted.length - lines.length;
  const more = hiddenCount > 0 ? `\n...còn ${hiddenCount} sự kiện khác.` : '';

  return `Sự kiện tháng ${month}/${year}:\n${lines.join('\n')}${more}`;
}

function isMissing(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function validateType(name: string, value: unknown, schema: any) {
  const expected = schema?.type;
  if (!expected || value === undefined || value === null) return undefined;

  if (expected === 'number' && typeof value !== 'number') return `${name} must be a number`;
  if (expected === 'string' && typeof value !== 'string') return `${name} must be a string`;
  if (expected === 'boolean' && typeof value !== 'boolean') return `${name} must be a boolean`;
  if (expected === 'object' && (typeof value !== 'object' || Array.isArray(value))) return `${name} must be an object`;
  return undefined;
}

function validateFormat(name: string, value: unknown) {
  if (typeof value !== 'string') return undefined;
  if (name === 'date' && !ISO_DATE.test(value)) return `${name} must use YYYY-MM-DD`;
  if (name === 'time' && value.trim() && !HH_MM.test(value)) return `${name} must use HH:mm`;
  return undefined;
}

function coerceDate(value: string) {
  const trimmed = value.trim();
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return value;

  const day = slashMatch[1].padStart(2, '0');
  const month = slashMatch[2].padStart(2, '0');
  return `${slashMatch[3]}-${month}-${day}`;
}

function coerceTime(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (HH_MM.test(trimmed)) return trimmed;

  const hourMinute = trimmed.match(/^(\d{1,2})\s*(?:h|gio|giờ)\s*(\d{1,2})?$/i);
  if (!hourMinute) return value;

  const hour = Number(hourMinute[1]);
  const minute = Number(hourMinute[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function coerceValue(field: string, value: unknown, schema: any) {
  if (isMissing(value)) return value;

  if (schema?.type === 'number' && typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (schema?.type === 'boolean' && typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'co', 'có'].includes(normalized)) return true;
    if (['false', 'no', '0', 'khong', 'không'].includes(normalized)) return false;
  }

  if (typeof value === 'string') {
    const enumValues = Array.isArray(schema?.enum) ? schema.enum : [];
    const enumMatch = enumValues.find((item: string) => item.toLowerCase() === value.trim().toLowerCase());
    if (enumMatch) return enumMatch;
    if (field === 'date') return coerceDate(value);
    if (field === 'time') return coerceTime(value);
  }

  return value;
}

export function repairToolArgs(toolName: string, args: any, tools: ToolSchema[]) {
  const tool = tools.find((candidate) => candidate?.function?.name === toolName);
  if (!tool || !args || typeof args !== 'object' || Array.isArray(args)) return args;

  const properties = tool.function?.parameters?.properties || {};
  const repaired = { ...args };
  for (const [field, schema] of Object.entries(properties)) {
    repaired[field] = coerceValue(field, repaired[field], schema);
  }
  return repaired;
}

export function validateToolArgs(toolName: string, args: any, tools: ToolSchema[]): ToolValidationResult {
  const tool = tools.find((candidate) => candidate?.function?.name === toolName);
  if (!tool) return { ok: true, errors: [] };

  const parameters = tool.function?.parameters || {};
  const properties = parameters.properties || {};
  const required = parameters.required || [];
  const value = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const errors: string[] = [];

  for (const field of required) {
    if (isMissing(value[field])) errors.push(`${field} is required`);
  }

  for (const [field, schema] of Object.entries(properties)) {
    const fieldValue = value[field];
    const typeError = validateType(field, fieldValue, schema);
    if (typeError) errors.push(typeError);

    const enumValues = Array.isArray((schema as any).enum) ? (schema as any).enum : [];
    if (!isMissing(fieldValue) && enumValues.length > 0 && !enumValues.includes(fieldValue)) {
      errors.push(`${field} must be one of: ${enumValues.join(', ')}`);
    }

    const formatError = validateFormat(field, fieldValue);
    if (formatError) errors.push(formatError);
  }

  return { ok: errors.length === 0, errors };
}

export function toolValidationError(toolName: string, errors: string[]): StructuredToolResult {
  return toolError(toolName, `Invalid tool arguments: ${errors.join('; ')}`);
}
