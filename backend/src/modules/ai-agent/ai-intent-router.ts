export { normalizeSearchText } from '../../utils/text-normalize.util';

export type AiIntent = 'general_chat' | 'image_vision';

export type AiIntentRoute = {
  intent: AiIntent;
  requiresTools: boolean;
  confidence: number;
  reason: string;
};
