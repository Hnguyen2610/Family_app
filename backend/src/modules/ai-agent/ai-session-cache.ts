import {
  buildResponseCacheKey,
  getCachedResponse,
  getCacheStats,
  getSkillTtl,
  isResponseCacheable,
  setCachedResponse,
} from './ai-response-cache';
import { AiIntentRoute } from './ai-intent-router';

type SessionCacheKeyInput = {
  familyId: string;
  userId: string;
  model: string;
  userMessage: string;
  intentRoute: AiIntentRoute;
  hasImage: boolean;
};

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
