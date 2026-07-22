import type { ChatUsage } from '@/lib/api-client';
import { formatCompactNumber } from '@/utils/format';

export type AiModelProvider = 'gemini' | 'groq';

export function createDefaultUsageByModel(): Partial<Record<AiModelProvider, ChatUsage>> {
  return {
    groq: {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      contextWindow: 131072,
      totalTokens: 0,
      maxOutputTokens: 1024,
      quota: { source: 'unavailable' },
    } as ChatUsage,
    gemini: {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      contextWindow: 1048576,
      totalTokens: 0,
      maxOutputTokens: 2048,
      quota: { source: 'unavailable' },
    } as ChatUsage,
  };
}

export function formatTokens(value?: number) {
  return formatCompactNumber(value);
}

export function formatQuota(usage: ChatUsage | undefined, language: string) {
  if (!usage || usage.quota.source !== 'headers') return language === 'vi' ? 'Chưa rõ' : 'Unknown';
  if (usage.quota.remainingRequests !== undefined) {
    return `${formatTokens(usage.quota.remainingRequests)} req`;
  }
  return `${formatTokens(usage.quota.remainingTokens)} tok`;
}

export function getContextLabel(usage?: ChatUsage) {
  if (!usage) return '--';
  if (usage.totalTokens > 0) return formatTokens(usage.totalTokens);
  return formatTokens(usage.contextWindow);
}

export function getContextNote(usage?: ChatUsage) {
  if (!usage) return 'No request yet';
  if (usage.contextWindow <= 0) return 'Unknown context';

  const ratio = usage.totalTokens / usage.contextWindow;
  if (ratio >= 1) return 'Full: trim history or fail';
  if (ratio >= 0.9) return 'Near full: old context may trim';
  return 'If full: trim history or fail';
}

export function getQuotaNote(usage?: ChatUsage) {
  if (!usage) return 'No request yet';
  if (usage.quota.source !== 'headers') return 'No remaining header';

  const noRequests =
    usage.quota.remainingRequests !== undefined && usage.quota.remainingRequests <= 0;
  const noTokens = usage.quota.remainingTokens !== undefined && usage.quota.remainingTokens <= 0;
  if (noRequests || noTokens) return 'Full: 429 until reset';

  const lowRequests =
    usage.quota.remainingRequests !== undefined && usage.quota.remainingRequests <= 5;
  const lowTokens =
    usage.quota.remainingTokens !== undefined &&
    usage.quota.remainingTokens <= usage.maxOutputTokens;
  if (lowRequests || lowTokens) return 'Low: next call may 429';

  return 'If empty: 429 until reset';
}

export function getContextPercent(usage?: ChatUsage) {
  if (!usage?.contextWindow) return 0;
  return clampPercent((usage.totalTokens / usage.contextWindow) * 100);
}

export function getQuotaPercent(usage?: ChatUsage) {
  if (!usage || usage.quota.source !== 'headers') return 0;
  if (usage.quota.limitTokens && usage.quota.remainingTokens !== undefined) {
    return clampPercent((usage.quota.remainingTokens / usage.quota.limitTokens) * 100);
  }
  if (usage.quota.limitRequests && usage.quota.remainingRequests !== undefined) {
    return clampPercent((usage.quota.remainingRequests / usage.quota.limitRequests) * 100);
  }
  return 0;
}

export function getContextBarColor(usage?: ChatUsage) {
  const percent = getContextPercent(usage);
  if (!usage) return 'bg-slate-300 dark:bg-slate-700';
  if (percent >= 95) return 'bg-rose-500';
  if (percent >= 85) return 'bg-amber-500';
  return 'bg-primary';
}

export function getQuotaBarColor(usage?: ChatUsage) {
  const percent = getQuotaPercent(usage);
  if (!usage || usage.quota.source !== 'headers') return 'bg-slate-300 dark:bg-slate-700';
  if (percent <= 5) return 'bg-rose-500';
  if (percent <= 15) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function getStatusLabel(status: string, language: string) {
  if (!status) return language === 'vi' ? 'Đang tạo câu trả lời' : 'Generating answer';
  const imageLabels: Record<string, string> = {
    compressing_image: language === 'vi' ? 'Đang nén ảnh' : 'Compressing image',
    uploading_image: language === 'vi' ? 'Đang gửi ảnh' : 'Uploading image',
    gemini_reading_image: language === 'vi' ? 'Gemini đang đọc ảnh' : 'Gemini is reading image',
  };
  if (imageLabels[status]) return imageLabels[status];

  const labels: Record<string, string> = {
    direct_response: language === 'vi' ? 'Đang trả kết quả trực tiếp' : 'Returning direct result',
    fetching_gold_price: language === 'vi' ? 'Đang lấy giá vàng' : 'Fetching gold price',
    building_menu: language === 'vi' ? 'Đang gợi ý thực đơn' : 'Building menu',
    checking_calendar: language === 'vi' ? 'Đang kiểm tra lịch' : 'Checking calendar',
    updating_calendar: language === 'vi' ? 'Đang cập nhật lịch' : 'Updating calendar',
    generating_answer: language === 'vi' ? 'Đang tạo câu trả lời' : 'Generating answer',
    reading_horoscope: language === 'vi' ? 'Đang xem tử vi' : 'Reading horoscope',
    reading_image: language === 'vi' ? 'Đang đọc hình ảnh' : 'Reading image',
    model_call: language === 'vi' ? 'Đang gọi AI' : 'Calling AI',
    model_stream_open: language === 'vi' ? 'Đang mở luồng trả lời' : 'Opening response stream',
  };
  return labels[status] || status;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
