import {
  buildFamilyScopeNotice,
  getCalendarReadFamilyId,
  getMutationFamilyId,
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

  it('builds the same unified all-family notice regardless of intent', () => {
    const readNotice = buildFamilyScopeNotice({ familyId: 'all', families });
    const writeNotice = buildFamilyScopeNotice({ familyId: 'all', families });

    expect(readNotice).toContain('USER IS VIEWING ALL FAMILIES');
    expect(readNotice).toBe(writeNotice);
    expect(readNotice).not.toContain('calendar');
  });

  it('returns no notice when a single family is resolved', () => {
    expect(buildFamilyScopeNotice({ familyId: 'all', families, resolvedFamilyId: 'family-b' }))
      .toContain('RESOLVED FAMILY');
  });
});
