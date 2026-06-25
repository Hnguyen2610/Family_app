export type AiIntent =
  | 'general_chat'
  | 'calendar_query'
  | 'event_mutation'
  | 'gold_price'
  | 'meal_suggestion'
  | 'horoscope'
  | 'family_knowledge'
  | 'image_vision';

export type AiIntentRoute = {
  intent: AiIntent;
  requiresTools: boolean;
  confidence: number;
  reason: string;
};

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function classifyAiIntent(userMessage: string, hasImage: boolean = false): AiIntentRoute {
  if (hasImage) {
    return {
      intent: 'image_vision',
      requiresTools: false,
      confidence: 1,
      reason: 'image_attached',
    };
  }

  const text = normalizeSearchText(userMessage || '');

  if (hasAny(text, ['gia vang', 'vang', 'gold', 'xauusd', 'sjc', 'doji', 'pnj'])) {
    return {
      intent: 'gold_price',
      requiresTools: true,
      confidence: 0.95,
      reason: 'gold_price_keyword',
    };
  }

  if (
    hasAny(text, [
      'tu vi',
      'horoscope',
      'cung hoang dao',
      'gio hoang dao',
      'ngay hoang dao',
      'ngay tot',
      'van han',
      'xem sao',
    ])
  ) {
    return {
      intent: 'horoscope',
      requiresTools: false,
      confidence: 0.9,
      reason: 'horoscope_keyword',
    };
  }

  if (
    hasAny(text, [
      'tao',
      'them',
      'len lich',
      'dat lich',
      'cap nhat',
      'sua',
      'xoa',
      'delete',
      'update',
      'schedule',
      'create event',
      'add event',
    ])
  ) {
    return {
      intent: 'event_mutation',
      requiresTools: true,
      confidence: 0.9,
      reason: 'event_mutation_keyword',
    };
  }

  if (
    hasAny(text, [
      'lich',
      'su kien',
      'event',
      'birthday',
      'sinh nhat',
      'hen',
      'ngay gio',
      'thang nay',
      'tuan nay',
    ])
  ) {
    return {
      intent: 'calendar_query',
      requiresTools: true,
      confidence: 0.85,
      reason: 'calendar_keyword',
    };
  }

  if (hasAny(text, ['am lich', 'lunar', 'ngay am', 'lich am'])) {
    return {
      intent: 'calendar_query',
      requiresTools: true,
      confidence: 0.85,
      reason: 'lunar_calendar_keyword',
    };
  }

  const asksFoodPreference =
    hasAny(text, ['thich', 'khong thich', 'ghet', 'di ung', 'so thich']) &&
    hasAny(text, ['an gi', 'mon gi', 'mon an', 'an uong', 'uong gi', 'do an', 'food']);
  if (asksFoodPreference) {
    return {
      intent: 'family_knowledge',
      requiresTools: false,
      confidence: 0.9,
      reason: 'family_food_preference_question',
    };
  }

  if (
    hasAny(text, [
      'hom nay an gi',
      'an gi',
      'thuc don',
      'menu',
      'mon an',
      'bua',
      'nau gi',
      'meal',
    ])
  ) {
    return {
      intent: 'meal_suggestion',
      requiresTools: true,
      confidence: 0.85,
      reason: 'meal_keyword',
    };
  }

  if (
    hasAny(text, [
      'family wiki',
      'wiki gia dinh',
      'tai lieu gia dinh',
      'ghi chu gia dinh',
      'kien thuc gia dinh',
      'thong tin gia dinh',
      'nha minh',
      'gia dinh minh',
      'quy tac nha',
      'so tay gia dinh',
    ])
  ) {
    return {
      intent: 'family_knowledge',
      requiresTools: false,
      confidence: 0.8,
      reason: 'family_knowledge_keyword',
    };
  }

  return {
    intent: 'general_chat',
    requiresTools: false,
    confidence: 0.6,
    reason: 'no_tool_keyword',
  };
}
