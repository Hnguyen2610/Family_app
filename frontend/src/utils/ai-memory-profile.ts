export type AiUserMemoryProfile = {
  enabled?: boolean;
  language?: string;
  answerStyle?: string;
  foodLikes?: string[];
  foodDislikes?: string[];
  healthRestrictions?: string[];
  familyNotes?: string[];
  note?: string;
  lastUpdatedAt?: string;
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
    foodLikes: toStringList(ai.foodLikes || ai.likes) || [],
    foodDislikes: toStringList(ai.foodDislikes || ai.dislikes) || [],
    healthRestrictions: toStringList(ai.healthRestrictions || ai.restrictions) || [],
    familyNotes: toStringList(ai.familyNotes) || [],
    note: typeof ai.note === 'string' ? ai.note : undefined,
    lastUpdatedAt: ai.lastUpdatedAt,
  };
}
