export type AiUserMemoryProfile = {
  enabled?: boolean;
  language?: string;
  answerStyle?: string;
  foodLikes?: string[];
  foodDislikes?: string[];
  healthRestrictions?: string[];
  familyNotes?: string[];
  note?: string;
};

function toStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return list.length ? list : undefined;
}

export function parseMemoryProfile(settings: unknown): AiUserMemoryProfile {
  if (!settings || typeof settings !== 'object') return {};

  const data = settings as Record<string, any>;
  const ai = data.aiMemory || data.ai || {};
  if (ai.enabled === false || ai.disabled === true) return { enabled: false };

  return {
    enabled: true,
    language: typeof ai.language === 'string' ? ai.language : undefined,
    answerStyle: typeof ai.answerStyle === 'string' ? ai.answerStyle : undefined,
    foodLikes: toStringList(ai.foodLikes || ai.likes),
    foodDislikes: toStringList(ai.foodDislikes || ai.dislikes),
    healthRestrictions: toStringList(ai.healthRestrictions || ai.restrictions),
    familyNotes: toStringList(ai.familyNotes),
    note: typeof ai.note === 'string' ? ai.note : undefined,
  };
}

export function buildMemoryProfileContext(profile: AiUserMemoryProfile): string {
  if (profile.enabled === false) return '';

  const parts = [];
  if (profile.language) parts.push(`Preferred language: ${profile.language}`);
  if (profile.answerStyle) parts.push(`Answer style: ${profile.answerStyle}`);
  if (profile.foodLikes?.length) parts.push(`Food likes: ${profile.foodLikes.join(', ')}`);
  if (profile.foodDislikes?.length) parts.push(`Food dislikes: ${profile.foodDislikes.join(', ')}`);
  if (profile.healthRestrictions?.length) {
    parts.push(`Health restrictions: ${profile.healthRestrictions.join(', ')}`);
  }
  if (profile.familyNotes?.length) parts.push(`Family notes: ${profile.familyNotes.join('; ')}`);
  if (profile.note) parts.push(`User note: ${profile.note}`);

  return parts.length ? `USER MEMORY PROFILE:\n${parts.join('\n')}` : '';
}
