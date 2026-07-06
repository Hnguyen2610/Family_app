const TRANSACTION_TYPES = new Set(['INCOME', 'EXPENSE']);
const TRANSACTION_CATEGORIES = new Set([
  'FOOD',
  'TRANSPORT',
  'SHOPPING',
  'UTILITIES',
  'RENT',
  'ENTERTAINMENT',
  'HEALTH',
  'EDUCATION',
  'SALARY',
  'BONUS',
  'INVESTMENT',
  'OTHER',
]);
const EVENT_TYPES = new Set(['BIRTHDAY', 'ANNIVERSARY', 'APPOINTMENT', 'REMINDER', 'TASK', 'GENERAL']);

export function normalizeTransactionType(value?: string | null) {
  const candidate = String(value || 'EXPENSE').toUpperCase();
  return TRANSACTION_TYPES.has(candidate) ? candidate : 'EXPENSE';
}

export function normalizeTransactionCategory(value?: string | null) {
  const candidate = String(value || 'OTHER').toUpperCase();
  return TRANSACTION_CATEGORIES.has(candidate) ? candidate : 'OTHER';
}

export function normalizeEventType(value?: string | null) {
  const candidate = String(value || 'GENERAL').toUpperCase();
  return EVENT_TYPES.has(candidate) ? candidate : 'GENERAL';
}

export function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function formatAmount(value?: number | string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
