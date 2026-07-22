import {
  buildFamilyScopeNotice,
  getCalendarReadFamilyId,
  getMutationFamilyId,
  getRagSearchFamilyIds,
  resolveFamilyMode,
  shouldIncludePrivateEvents,
} from './ai-family-scope-policy';

describe('ai-family-scope-policy', () => {
  const families = [
    { id: 'family-a', name: 'Gia dinh A' },
    { id: 'family-b', name: 'Gia dinh B' },
  ];

  it('keeps all-family reads broad while mutations require a concrete family', () => {
    expect(resolveFamilyMode({ familyId: 'all' })).toBe('all');
    expect(getCalendarReadFamilyId({ familyId: 'all' })).toBe('all');
    expect(getMutationFamilyId({ familyId: 'all' })).toBeUndefined();
  });

  it('uses the resolved family when one is available', () => {
    const input = { familyId: 'all', resolvedFamilyId: 'family-b' };

    expect(resolveFamilyMode(input)).toBe('single');
    expect(getCalendarReadFamilyId(input)).toBe('family-b');
    expect(getMutationFamilyId(input)).toBe('family-b');
  });

  it('detects personal/private event wording', () => {
    expect(shouldIncludePrivateEvents('hom nay su kien cua toi co gi')).toBe(true);
    expect(shouldIncludePrivateEvents('lich gia dinh hom nay')).toBe(false);
  });

  it('returns all family ids for all-family RAG when no family is resolved', () => {
    expect(getRagSearchFamilyIds({ familyId: 'all', families })).toEqual(['family-a', 'family-b']);
    expect(getRagSearchFamilyIds({ familyId: 'all', resolvedFamilyId: 'family-b', families })).toEqual(['family-b']);
  });

  it('builds a read-only all-family notice for calendar queries', () => {
    expect(buildFamilyScopeNotice({ familyId: 'all', families, intent: 'calendar_query' }))
      .toContain('USER IS VIEWING ALL FAMILIES');
  });
});
