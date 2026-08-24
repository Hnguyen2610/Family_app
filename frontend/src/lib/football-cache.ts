import { FOOTBALL_CACHE_PREFIX } from './storage-keys';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_STALE_TTL_MS = 6 * 60 * 60 * 1000;

type FootballCacheEnvelope<T> = {
  data: T;
  savedAt: number;
  expiresAt: number;
};

function getCacheKey(parts: Array<string | number | null | undefined>) {
  return `${FOOTBALL_CACHE_PREFIX}:${parts.map((part) => part ?? 'all').join(':')}`;
}

function readCache<T>(key: string): FootballCacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as FootballCacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T, ttlMs: number) {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    window.localStorage.setItem(key, JSON.stringify({
      data,
      savedAt: now,
      expiresAt: now + ttlMs,
    }));
  } catch {
    // Best-effort cache: quota/private-mode failures should never break football data.
  }
}

export async function cachedFootballRequest<T>(
  parts: Array<string | number | null | undefined>,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
  staleTtlMs = DEFAULT_STALE_TTL_MS,
): Promise<T> {
  const key = getCacheKey(parts);
  const cached = readCache<T>(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const data = await fetcher();
    writeCache(key, data, ttlMs);
    return data;
  } catch (error) {
    if (cached && cached.savedAt + staleTtlMs > now) {
      return cached.data;
    }
    throw error;
  }
}
