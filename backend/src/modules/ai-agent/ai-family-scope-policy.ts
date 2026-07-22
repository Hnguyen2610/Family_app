export type AiFamilySource = 'web' | 'telegram' | 'telegram_group' | 'telegram_private';

export type FamilyScopePolicyInput = {
  familyId: string;
  resolvedFamilyId?: string;
  source?: AiFamilySource;
};

export function resolveFamilyMode(input: FamilyScopePolicyInput) {
  if (input.source === 'telegram_group') return 'telegram_group';
  if (input.source === 'telegram_private') return 'private';
  if (input.familyId === 'all') return input.resolvedFamilyId ? 'single' : 'all';
  return 'single';
}

export function getCalendarReadFamilyId(input: FamilyScopePolicyInput) {
  return input.resolvedFamilyId || input.familyId;
}

export function getMutationFamilyId(input: FamilyScopePolicyInput) {
  return input.resolvedFamilyId || (input.familyId !== 'all' ? input.familyId : undefined);
}

export function shouldIncludePrivateEvents(userMessage: string) {
  const normalized = userMessage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(cua toi|ca nhan|private|rieng toi|lich toi|su kien toi)\b/.test(normalized);
}

export function buildFamilyScopeNotice(input: {
  familyId: string;
  families: Array<{ id: string; name: string }>;
  intent: string;
  resolvedFamilyId?: string;
}) {
  const { familyId, families, intent, resolvedFamilyId } = input;
  if (familyId === 'all' && families.length > 1 && !resolvedFamilyId) {
    if (intent === 'calendar_query') {
      return 'USER IS VIEWING ALL FAMILIES. For read-only calendar queries, call calendar tools with familyId "all" and include private events by passing userId.';
    }
    return `USER IS VIEWING ALL FAMILIES. Their families:\n${families.map((family, index) => `${index + 1}. ${family.name} (id: ${family.id})`).join('\n')}\nINSTRUCTION: Ask the user ONCE which family to use. When they answer with a family name, call the tool immediately with that family's id - do NOT ask again.`;
  }
  if (resolvedFamilyId) {
    return `RESOLVED FAMILY: Using "${families.find((family) => family.id === resolvedFamilyId)?.name || resolvedFamilyId}" (id: ${resolvedFamilyId}) for all write operations.`;
  }
  return '';
}

export function getRagSearchFamilyIds(input: {
  familyId: string;
  resolvedFamilyId?: string;
  families: Array<{ id: string; name: string }>;
}) {
  if (input.resolvedFamilyId) return [input.resolvedFamilyId];
  if (input.familyId === 'all') return input.families.map((family) => family.id);
  return [input.familyId].filter(Boolean);
}
