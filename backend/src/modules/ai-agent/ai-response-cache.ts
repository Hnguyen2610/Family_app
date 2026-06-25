import { AiIntentRoute } from './ai-intent-router';

const DEFAULT_TTL_MS = Number.parseInt(process.env.AI_RESPONSE_CACHE_TTL_MS || '3600000', 10);
const MAX_ENTRIES = Number.parseInt(process.env.AI_RESPONSE_CACHE_MAX_ENTRIES || '200', 10);
const PROMPT_VERSION = 'skill-cache-v2';

// Per-skill TTL configuration (ms)
export const SKILL_CACHE_TTL: Partial<Record<string, number>> = {
  general_chat: 3600_000,    // 1 hour — factual Q&A rarely changes
  gold_price:   5 * 60_000,  // 5 min — market price refreshes frequently
  horoscope:    3600_000,     // 1 hour — daily horoscope is stable
  meal_suggest: 30 * 60_000, // 30 min — menu suggestions per session
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type CachedAiResponse = {
  content: string;
  familyId: string;
  usage?: any;
};

const cache = new Map<string, CacheEntry<CachedAiResponse>>();

function normalizeQuestion(text: string): string {
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

export function getSkillTtl(intent: string): number {
  return SKILL_CACHE_TTL[intent] ?? DEFAULT_TTL_MS;
}

export function isResponseCacheable(
  userMessage: string,
  hasImage: boolean,
  intentRoute: AiIntentRoute
): boolean {
  if (hasImage) return false;
  if (intentRoute.requiresTools) return false;

  const normalizedQuestion = normalizeQuestion(userMessage);
  if (normalizedQuestion.length < 4) return false;
  if (looksContextDependent(normalizedQuestion)) return false;

  // Cacheable intents — add more as needed
  const cacheableIntents = new Set([
    'general_chat',
    'gold_price',
    'horoscope',
    'meal_suggest',
  ]);

  return cacheableIntents.has(intentRoute.intent);
}

export function buildResponseCacheKey(input: {
  familyId: string;
  userId: string;
  model: string;
  userMessage: string;
  intent?: string;
}): string {
  // For time-sensitive skills (gold_price), bucket by 5-min window
  const timeBucket = input.intent === 'gold_price'
    ? Math.floor(Date.now() / (5 * 60_000))
    : Math.floor(Date.now() / 3600_000); // hourly bucket for others

  return [
    PROMPT_VERSION,
    input.intent || 'unknown',
    input.familyId || 'no-family',
    input.userId || 'no-user',
    input.model || 'default-model',
    input.intent === 'gold_price' ? `t${timeBucket}` : normalizeQuestion(input.userMessage),
  ].join('|');
}

export function getCachedResponse(key: string): CachedAiResponse | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

export function setCachedResponse(key: string, value: CachedAiResponse, ttlMs = DEFAULT_TTL_MS) {
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  for (const entry of cache.values()) {
    if (entry.expiresAt > now) active++;
    else expired++;
  }
  return { total: cache.size, active, expired };
}
