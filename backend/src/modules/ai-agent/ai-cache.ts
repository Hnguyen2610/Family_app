const DEFAULT_TTL_MS = Number.parseInt(process.env.AI_RESPONSE_CACHE_TTL_MS || '3600000', 10);
const MAX_ENTRIES = Number.parseInt(process.env.AI_RESPONSE_CACHE_MAX_ENTRIES || '200', 10);
const PROMPT_VERSION = 'skill-cache-v6';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type CachedAiResponse = {
  content: string;
  familyId?: string;
  usage?: any;
};

type SessionCacheKeyInput = {
  familyId: string;
  userId: string;
  model: string;
  userMessage: string;
  hasImage: boolean;
};

const responseCache = new Map<string, CacheEntry<CachedAiResponse>>();

export function normalizeQuestion(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function looksContextDependent(normalizedQuestion: string): boolean {
  if (!normalizedQuestion) return true;

  const followUpPhrases = [
    'tiep',
    'tiep tuc',
    'cai do',
    'viec do',
    'no',
    'vay',
    'nhu tren',
    'again',
    'continue',
    'that',
    'it',
  ];

  return followUpPhrases.some((phrase) => normalizedQuestion === phrase);
}

/**
 * Detects if a question is specific to personal family data
 * (calendar, events, daily tasks, family notes, budgets, family members).
 * If true -> scope cache to familyId & userId.
 * If false -> global scope (cache shared across all families).
 */
export function isPersonalFamilyContextQuery(userMessage: string): boolean {
  const normalized = normalizeQuestion(userMessage);
  if (!normalized) return false;

  // General market/public query exceptions (gold, weather, news, recipes, etc.)
  const publicTopicKeywords = [
    'gia vang', 'thoi tiet', 'tin tuc', 'chungkhoan', 'coin', 'crypto', 'ty gia',
    'cach lam', 'cach nau', 'huong dan', 'la gi', 'phim', 'bong da', 'ket qua'
  ];

  if (publicTopicKeywords.some((topic) => normalized.includes(topic))) {
    return false;
  }

  const personalKeywords = [
    // Calendar & Events & Reminders
    'lich', 'su kien', 'nhac nho', 'cuoc hop', 'lunar', 'lich trinh', 'event', 'calendar',

    // Tasks & Notes
    'so tay', 'ghi chu', 'nhat ky', 'task', 'nhiem vu', 'viec hang ngay', 'todo', 'note',

    // Finance & Budget
    'chi tieu', 'thu nhap', 'ngan sach', 'quy gia dinh', 'tai chinh', 'transaction', 'luong', 'thuong', 'budget',

    // Family Members & Routine
    'nha toi', 'nha minh', 'vo toi', 'chong toi', 'con toi', 'bo toi', 'me toi', 'family', 'routine',

    // Personal pronouns / references
    'cua toi', 'cua minh', 'cho toi', 'cho minh'
  ];

  return personalKeywords.some((kw) => normalized.includes(kw));
}

export function isResponseCacheable(userMessage: string, hasImage: boolean): boolean {
  if (hasImage) return false;

  const normalizedQuestion = normalizeQuestion(userMessage);
  if (normalizedQuestion.length < 4) return false;
  if (looksContextDependent(normalizedQuestion)) return false;

  return true;
}

export function buildResponseCacheKey(input: {
  familyId: string;
  userId: string;
  model: string;
  userMessage: string;
}): string {
  const timeBucket = Math.floor(Date.now() / 3600_000);
  const normalized = normalizeQuestion(input.userMessage);
  const isPersonal = isPersonalFamilyContextQuery(input.userMessage);

  if (isPersonal) {
    // Scoped to specific family & user for privacy & correctness
    return [
      PROMPT_VERSION,
      `fam:${input.familyId || 'no-family'}`,
      `usr:${input.userId || 'no-user'}`,
      input.model || 'default-model',
      normalized,
      `t${timeBucket}`,
    ].join('|');
  }

  // Global scope: General knowledge, recipes, general chat, general weather, general math/explain
  // Shared across ALL families!
  return [
    PROMPT_VERSION,
    'scope:global',
    input.model || 'default-model',
    normalized,
    `t${timeBucket}`,
  ].join('|');
}

export function getCachedResponse(key: string): CachedAiResponse | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }

  return entry.value;
}

export function setCachedResponse(key: string, value: CachedAiResponse, ttlMs = DEFAULT_TTL_MS) {
  if (responseCache.size >= MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }

  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  for (const entry of responseCache.values()) {
    if (entry.expiresAt > now) active++;
    else expired++;
  }
  return { total: responseCache.size, active, expired };
}

export function buildSessionCacheKey(input: SessionCacheKeyInput) {
  const { familyId, userId, model, userMessage, hasImage } = input;
  return isResponseCacheable(userMessage, hasImage)
    ? buildResponseCacheKey({ familyId, userId, model, userMessage })
    : undefined;
}

export function getSessionCachedResponse(cacheKey?: string) {
  return cacheKey ? getCachedResponse(cacheKey) : undefined;
}

export function setSessionCachedResponse(cacheKey: string | undefined, result: any) {
  if (!cacheKey) return;
  setCachedResponse(cacheKey, result, DEFAULT_TTL_MS);
}

export function getSessionCacheStats() {
  return getCacheStats();
}
