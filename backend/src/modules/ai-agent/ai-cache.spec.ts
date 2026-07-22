import { isResponseCacheable, buildSessionCacheKey, setSessionCachedResponse, getSessionCachedResponse } from './ai-cache';

describe('ai-cache without intent classification', () => {
  it('isResponseCacheable takes hasImage but no intentRoute', () => {
    expect(isResponseCacheable('hom nay troi the nao', false)).toBe(true);
    expect(isResponseCacheable('xem anh nay', true)).toBe(false);
  });

  it('caches and retrieves a response using a key built without intentRoute', () => {
    const key = buildSessionCacheKey({
      familyId: 'family-a',
      userId: 'user-1',
      model: 'groq',
      userMessage: 'gia vang hom nay',
      hasImage: false,
    });
    expect(key).toBeDefined();
    setSessionCachedResponse(key!, { content: 'test' });
    expect(getSessionCachedResponse(key!)?.content).toBe('test');
  });
});
