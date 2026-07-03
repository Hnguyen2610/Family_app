import { toolError, type StructuredToolResult } from './ai-tool-results';

type ToolSchema = {
  function?: {
    name?: string;
    parameters?: {
      properties?: Record<string, any>;
      required?: string[];
    };
  };
};

export type ToolValidationResult = {
  ok: boolean;
  errors: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

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
