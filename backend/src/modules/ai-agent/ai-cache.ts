import { AiIntentRoute } from './ai-intent-router';

const DEFAULT_TTL_MS = Number.parseInt(process.env.AI_RESPONSE_CACHE_TTL_MS || '3600000', 10);
const MAX_ENTRIES = Number.parseInt(process.env.AI_RESPONSE_CACHE_MAX_ENTRIES || '200', 10);
const PROMPT_VERSION = 'skill-cache-v2';

export const SKILL_CACHE_TTL: Partial<Record<string, number>> = {
  general_chat: 3600_000,
  gold_price: 5 * 60_000,
  horoscope: 3600_000,
  meal_suggestion: 30 * 60_000,
  football: 5 * 60_000,
  weather: 30 * 60_000,
  family_knowledge: 10 * 60_000,
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

type SessionCacheKeyInput = {
  familyId: string;
  userId: string;
  model: string;
  userMessage: string;
  intentRoute: AiIntentRoute;
  hasImage: boolean;
};

const responseCache = new Map<string, CacheEntry<CachedAiResponse>>();

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
  intentRoute: AiIntentRoute,
): boolean {
  if (hasImage) return false;
  const cacheableToolIntents = new Set(['football']);
  if (intentRoute.requiresTools && !cacheableToolIntents.has(intentRoute.intent)) return false;

  const normalizedQuestion = normalizeQuestion(userMessage);
  if (normalizedQuestion.length < 4) return false;
  if (looksContextDependent(normalizedQuestion)) return false;

  const cacheableIntents = new Set([
    'general_chat',
    'gold_price',
    'horoscope',
    'meal_suggestion',
    'football',
    'weather',
    'family_knowledge',
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
  const shortTtlIntent = input.intent === 'gold_price' || input.intent === 'football' || input.intent === 'weather';
  const timeBucket = shortTtlIntent
    ? Math.floor(Date.now() / (5 * 60_000))
    : Math.floor(Date.now() / 3600_000);

  return [
    PROMPT_VERSION,
    input.intent || 'unknown',
    input.familyId || 'no-family',
    input.userId || 'no-user',
    input.model || 'default-model',
    shortTtlIntent ? `t${timeBucket}:${normalizeQuestion(input.userMessage)}` : normalizeQuestion(input.userMessage),
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
  const { familyId, userId, model, userMessage, intentRoute, hasImage } = input;
  return isResponseCacheable(userMessage, hasImage, intentRoute)
    ? buildResponseCacheKey({ familyId, userId, model, userMessage, intent: intentRoute.intent })
    : undefined;
}

export function getSessionCachedResponse(cacheKey?: string) {
  return cacheKey ? getCachedResponse(cacheKey) : undefined;
}

export function setSessionCachedResponse(cacheKey: string | undefined, result: any, intent: string) {
  if (!cacheKey) return;
  setCachedResponse(cacheKey, result, getSkillTtl(intent));
}

export function getSessionCacheStats() {
  return getCacheStats();
}
