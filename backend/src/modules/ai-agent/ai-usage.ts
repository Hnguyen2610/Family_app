export type AiProvider = 'groq' | 'gemini';
export type UsageSource = 'api' | 'estimated';
export type QuotaSource = 'headers' | 'unavailable';

export type AiRateLimitQuota = {
  source: QuotaSource;
  remainingRequests?: number;
  remainingTokens?: number;
  limitRequests?: number;
  limitTokens?: number;
  resetRequests?: string;
  resetTokens?: string;
  retryAfter?: string;
  note?: string;
};

export type AiUsageSnapshot = {
  provider: AiProvider;
  model: string;
  contextWindow: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  remainingTokens: number;
  maxOutputTokens: number;
  historyLimit: number;
  source: UsageSource;
  quota: AiRateLimitQuota;
};

type BuildUsageInput = {
  provider: AiProvider;
  model: string;
  contextWindow: number;
  maxOutputTokens: number;
  historyLimit: number;
  promptText?: string;
  completionText?: string;
  quota?: AiRateLimitQuota;
  apiUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type HeaderLike = {
  get(name: string): string | null;
};

function parseNumberHeader(headers: HeaderLike, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseGroqRateLimitQuota(headers?: HeaderLike): AiRateLimitQuota {
  if (!headers) {
    return { source: 'unavailable', note: 'Groq rate-limit headers were not available.' };
  }

  return {
    source: 'headers',
    remainingRequests: parseNumberHeader(headers, 'x-ratelimit-remaining-requests'),
    remainingTokens: parseNumberHeader(headers, 'x-ratelimit-remaining-tokens'),
    limitRequests: parseNumberHeader(headers, 'x-ratelimit-limit-requests'),
    limitTokens: parseNumberHeader(headers, 'x-ratelimit-limit-tokens'),
    resetRequests: headers.get('x-ratelimit-reset-requests') || undefined,
    resetTokens: headers.get('x-ratelimit-reset-tokens') || undefined,
    retryAfter: headers.get('retry-after') || undefined,
  };
}

export function unavailableQuota(note: string): AiRateLimitQuota {
  return { source: 'unavailable', note };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function buildUsageSnapshot(input: BuildUsageInput): AiUsageSnapshot {
  const promptTokens =
    input.apiUsage?.prompt_tokens ??
    input.apiUsage?.promptTokenCount ??
    estimateTokens(input.promptText || '');
  const completionTokens =
    input.apiUsage?.completion_tokens ??
    input.apiUsage?.candidatesTokenCount ??
    estimateTokens(input.completionText || '');
  const totalTokens =
    input.apiUsage?.total_tokens ??
    input.apiUsage?.totalTokenCount ??
    promptTokens + completionTokens;

  return {
    provider: input.provider,
    model: input.model,
    contextWindow: input.contextWindow,
    promptTokens,
    completionTokens,
    totalTokens,
    remainingTokens: Math.max(input.contextWindow - totalTokens, 0),
    maxOutputTokens: input.maxOutputTokens,
    historyLimit: input.historyLimit,
    source: input.apiUsage ? 'api' : 'estimated',
    quota: input.quota || unavailableQuota('Quota remaining is not exposed by this provider response.'),
  };
}
