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
