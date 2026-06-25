import { AiIntentRoute } from './ai-intent-router';

export type RoutedModel = {
  provider: 'groq' | 'gemini';
  model: string;
  route: 'explicit' | 'fast' | 'tool' | 'reasoning' | 'fallback_default' | 'vision';
};

function getProviderFromSelection(selection?: string): 'groq' | 'gemini' | undefined {
  if (selection === 'groq' || selection === 'gemini') return selection;
  return undefined;
}

export function routeAiModel(selection: string | undefined, intentRoute: AiIntentRoute): RoutedModel {
  // If there is an image, we MUST use Gemini regardless of selection (unless selection is also Gemini)
  if (intentRoute.intent === 'image_vision') {
    return {
      provider: 'gemini',
      model: process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash',
      route: 'vision',
    };
  }

  const explicitProvider = getProviderFromSelection(selection);
  if (explicitProvider) {
    return {
      provider: explicitProvider,
      model:
        explicitProvider === 'gemini'
          ? process.env.GEMINI_MODEL || 'gemini-3.5-flash'
          : process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      route: 'explicit',
    };
  }

  if (intentRoute.requiresTools) {
    return {
      provider: 'groq',
      model: process.env.AI_TOOL_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      route: 'tool',
    };
  }

  if (intentRoute.intent === 'horoscope') {
    return {
      provider: 'groq',
      model:
        process.env.AI_REASONING_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      route: 'reasoning',
    };
  }

  return {
    provider: 'groq',
    model: process.env.AI_FAST_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    route: 'fast',
  };
}
