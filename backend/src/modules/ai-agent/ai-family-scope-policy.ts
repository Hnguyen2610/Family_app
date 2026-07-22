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
  resolvedFamilyId?: string;
}) {
  const { familyId, families, resolvedFamilyId } = input;
  if (familyId === 'all' && families.length > 1 && !resolvedFamilyId) {
    return `USER IS VIEWING ALL FAMILIES. Their families:\n${families.map((family, index) => `${index + 1}. ${family.name} (id: ${family.id})`).join('\n')}\nINSTRUCTION: For read-only questions, you may query across all families (pass familyId "all") without asking. Before any tool call that creates, updates, or deletes data for one specific family, ask the user ONCE which family to use, then call the tool immediately with that family's id - do NOT ask again once they've answered.`;
  }
  if (resolvedFamilyId) {
    return `RESOLVED FAMILY: Using "${families.find((family) => family.id === resolvedFamilyId)?.name || resolvedFamilyId}" (id: ${resolvedFamilyId}) for all write operations.`;
  }
  return '';
}
