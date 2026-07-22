export type RoutedModel = {
  provider: 'groq' | 'gemini';
  model: string;
  route: 'explicit' | 'fast' | 'tool' | 'reasoning' | 'fallback_default' | 'vision';
  reason: string;
};

function getProviderFromSelection(selection?: string): 'groq' | 'gemini' | undefined {
  if (selection === 'groq' || selection === 'gemini') return selection;
  return undefined;
}

export function routeAiModel(selection: string | undefined, hasImage: boolean): RoutedModel {
  if (hasImage) {
    return {
      provider: 'gemini',
      model: process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash',
      route: 'vision',
      reason: 'image input requires a vision-capable model',
    };
  }

  const explicitProvider = getProviderFromSelection(selection);
  if (explicitProvider) {
    return {
      provider: explicitProvider,
      model:
        explicitProvider === 'gemini'
          ? process.env.GEMINI_MODEL || 'gemini-3.5-flash'
          : process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      route: 'explicit',
      reason: `user selected ${explicitProvider}`,
    };
  }

  return {
    provider: 'groq',
    model: process.env.AI_TOOL_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    route: 'tool',
    reason: 'every turn can call tools now, so the tool-capable model is the default',
  };
}
