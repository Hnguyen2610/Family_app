import {
  isResponseCacheable,
  buildSessionCacheKey,
  setSessionCachedResponse,
  getSessionCachedResponse,
  isPersonalFamilyContextQuery,
} from './ai-cache';

describe('ai-cache dual-scope tests', () => {
  it('isResponseCacheable takes hasImage but no intentRoute', () => {
    expect(isResponseCacheable('hom nay troi the nao', false)).toBe(true);
    expect(isResponseCacheable('xem anh nay', true)).toBe(false);
  });

  it('detects personal family context queries accurately', () => {
    expect(isPersonalFamilyContextQuery('Hôm nay có lịch gì không')).toBe(true);
    expect(isPersonalFamilyContextQuery('Xem chi tiêu tháng này của tôi')).toBe(true);
    expect(isPersonalFamilyContextQuery('Sổ tay gia đình ghi chú gì')).toBe(true);

    // Global queries
    expect(isPersonalFamilyContextQuery('Cách làm món phở cuốn')).toBe(false);
    expect(isPersonalFamilyContextQuery('Giá vàng hôm nay bao nhiêu')).toBe(false);
    expect(isPersonalFamilyContextQuery('Giải thích thuật toán Binary Search')).toBe(false);
  });

  it('shares cache globally for general knowledge queries across families', () => {
    const keyFamilyA = buildSessionCacheKey({
      familyId: 'family-a',
      userId: 'user-1',
      model: 'groq',
      userMessage: 'Cách làm món phở cuốn ngon',
      hasImage: false,
    });

    const keyFamilyB = buildSessionCacheKey({
      familyId: 'family-b',
      userId: 'user-2',
      model: 'groq',
      userMessage: 'Cách làm món phở cuốn ngon',
      hasImage: false,
    });

    // Keys should be equal (global scope)
    expect(keyFamilyA).toEqual(keyFamilyB);

    setSessionCachedResponse(keyFamilyA, { content: 'Công thức nấu phở cuốn...' });
    expect(getSessionCachedResponse(keyFamilyB)?.content).toEqual('Công thức nấu phở cuốn...');
  });

  it('isolates cache per family for personal family data queries', () => {
    const keyFamilyA = buildSessionCacheKey({
      familyId: 'family-a',
      userId: 'user-1',
      model: 'groq',
      userMessage: 'Hôm nay gia đình mình có lịch gì không',
      hasImage: false,
    });

    const keyFamilyB = buildSessionCacheKey({
      familyId: 'family-b',
      userId: 'user-2',
      model: 'groq',
      userMessage: 'Hôm nay gia đình mình có lịch gì không',
      hasImage: false,
    });

    // Keys MUST be different for family privacy
    expect(keyFamilyA).not.toEqual(keyFamilyB);
  });
});
