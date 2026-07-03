import { normalizeSearchText } from '../../utils/text-normalize.util';

export { normalizeSearchText } from '../../utils/text-normalize.util';

export type AiIntent =
  | 'general_chat'
  | 'calendar_query'
  | 'event_mutation'
  | 'gold_price'
  | 'meal_suggestion'
  | 'horoscope'
  | 'family_knowledge'
  | 'image_vision'
  | 'football'
  | 'weather'
  | 'web_search';

export type AiIntentRoute = {
  intent: AiIntent;
  requiresTools: boolean;
  confidence: number;
  reason: string;
};

type RouteOptions = {
  confidence?: number;
  reason: string;
};

function route(intent: AiIntent, requiresTools: boolean, options: RouteOptions): AiIntentRoute {
  return {
    intent,
    requiresTools,
    confidence: options.confidence ?? 0.95,
    reason: options.reason,
  };
}

function needsClassifier(reason: string, fallbackIntent: AiIntent = 'general_chat', requiresTools = false): AiIntentRoute {
  return route(fallbackIntent, requiresTools, {
    confidence: 0.55,
    reason: `needs_intent_classifier:${reason}`,
  });
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasScheduleSignal(text: string): boolean {
  return hasAny(text, [
    'lich',
    'lich thi dau',
    'tran tiep theo',
    'tran sap toi',
    'tran sau',
    'hom nao',
    'khi nao',
    'luc nao',
    'ngay nao',
    'may gio',
    'schedule',
    'fixtures',
    'matches',
  ]);
}

function hasSpecificSubjectSignal(text: string): boolean {
  return /\bcua\s+[a-z0-9 ]{2,}\b/.test(text) || /\b(doi tuyen|clb|fc|club|national team)\b/.test(text);
}

function hasFootballCompetitionSignal(text: string): boolean {
  return hasAny(text, [
    'bong da',
    'football',
    'soccer',
    'world cup',
    'fifa',
    'ngoai hang anh',
    'premier league',
    'la liga',
    'bundesliga',
    'serie a',
    'champions league',
    'c1',
    'ligue 1',
    'v-league',
    'v league',
  ]);
}

function isWeatherQuestion(text: string): boolean {
  return hasAny(text, [
    'thoi tiet',
    'du bao thoi tiet',
    'nhiet do',
    'do am',
    'gio mua',
    'co mua khong',
    'weather',
    'temperature',
    'forecast',
    'rain',
    'humidity',
  ]);
}

function isBroadFootballRequest(text: string): boolean {
  if (!hasFootballCompetitionSignal(text)) return false;
  if (hasSpecificSubjectSignal(text)) return false;
  return hasScheduleSignal(text) || hasAny(text, ['ket qua', 'ti so', 'ty so', 'bang xep hang', 'standings']);
}

function isDeterministicCalendarQuery(text: string): boolean {
  return hasAny(text, [
    'lich gia dinh',
    'lich nha',
    'lich thang',
    'lich tuan',
    'lich hom nay',
    'lich ngay mai',
    'su kien',
    'event',
    'birthday',
    'sinh nhat',
    'hen',
    'ngay gio',
    'thang nay',
    'tuan nay',
    'hom nay co su kien',
    'ngay mai co su kien',
  ]);
}

function isLikelyEventMutation(text: string): boolean {
  const mutationSignals = [
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
  ];
  const eventSignals = [
    'lich',
    'su kien',
    'event',
    'birthday',
    'sinh nhat',
    'hen',
    'anniversary',
    'ky niem',
    'nhac',
  ];

  if (hasAny(text, ['create event', 'add event', 'len lich', 'dat lich'])) return true;
  return hasAny(text, mutationSignals) && hasAny(text, eventSignals);
}

export function classifyAiIntent(userMessage: string, hasImage: boolean = false): AiIntentRoute {
  if (hasImage) {
    return route('image_vision', false, { confidence: 1, reason: 'image_attached' });
  }

  const text = normalizeSearchText(userMessage || '').trim();
  if (!text) {
    return route('general_chat', false, { confidence: 0.6, reason: 'empty_message' });
  }

  if (hasAny(text, ['web search:', 'internet search:', 'tra cuu internet:', 'tim kiem internet:'])) {
    return route('web_search', true, { confidence: 0.98, reason: 'explicit_web_search' });
  }

  if (hasAny(text, ['gia vang', 'vang', 'gold', 'xauusd', 'sjc', 'doji', 'pnj'])) {
    return route('gold_price', true, { confidence: 0.95, reason: 'gold_price_keyword' });
  }

  if (hasAny(text, ['tu vi', 'horoscope', 'cung hoang dao', 'gio hoang dao', 'ngay hoang dao', 'ngay tot', 'van han', 'xem sao'])) {
    return route('horoscope', false, { confidence: 0.9, reason: 'horoscope_keyword' });
  }

  if (isWeatherQuestion(text)) {
    return route('weather', false, { confidence: 0.95, reason: 'weather_keyword' });
  }

  if (isLikelyEventMutation(text)) {
    return route('event_mutation', true, { confidence: 0.9, reason: 'event_mutation_keyword' });
  }

  if (isBroadFootballRequest(text)) {
    return route('football', true, { confidence: 0.95, reason: 'broad_football_request' });
  }

  if (isDeterministicCalendarQuery(text)) {
    return route('calendar_query', true, { confidence: 0.9, reason: 'calendar_keyword' });
  }

  const asksFoodPreference =
    hasAny(text, ['thich', 'khong thich', 'ghet', 'di ung', 'so thich']) &&
    hasAny(text, ['an gi', 'mon gi', 'mon an', 'an uong', 'uong gi', 'do an', 'food']);
  if (asksFoodPreference) {
    return route('family_knowledge', false, { confidence: 0.9, reason: 'family_food_preference_question' });
  }

  if (hasAny(text, ['hom nay an gi', 'an gi', 'thuc don', 'menu', 'mon an', 'bua', 'nau gi', 'meal'])) {
    return route('meal_suggestion', true, { confidence: 0.85, reason: 'meal_keyword' });
  }

  if (hasAny(text, ['family wiki', 'wiki gia dinh', 'tai lieu gia dinh', 'ghi chu gia dinh', 'kien thuc gia dinh', 'thong tin gia dinh', 'nha minh', 'gia dinh minh', 'quy tac nha', 'so tay gia dinh'])) {
    return route('family_knowledge', false, { confidence: 0.85, reason: 'family_knowledge_keyword' });
  }

  if (hasFootballCompetitionSignal(text)) {
    return needsClassifier('football_or_realtime', 'web_search', true);
  }

  if (hasScheduleSignal(text)) {
    return needsClassifier('ambiguous_schedule');
  }

  if (hasAny(text, ['bao nhieu', 'la gi', 'tai sao', 'the nao', 'how many', 'what is', 'why', 'hom nay', 'nam nay', 'moi nhat', 'latest', 'news', 'tin tuc', 'current', 'real-time', 'ban co biet', 'tim giup', 'search'])) {
    return needsClassifier('factual_or_realtime', 'web_search', true);
  }

  return needsClassifier('general_natural_language');
}
