import type { ChatUsage } from '@/lib/api-client';
import { formatCompactNumber } from '@/utils/format';

export type AiModelProvider = 'gemini' | 'groq';

export function createDefaultUsageByModel(): Partial<Record<AiModelProvider, ChatUsage>> {
  return {
    groq: {
      provider: 'groq',
      model: 'qwen/qwen3.6-27b',
      contextWindow: 131072,
      totalTokens: 0,
      maxOutputTokens: 1024,
      quota: { source: 'unavailable' },
    } as ChatUsage,
    gemini: {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      contextWindow: 1048576,
      totalTokens: 0,
      maxOutputTokens: 2048,
      quota: { source: 'unavailable' },
    } as ChatUsage,
  };
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'openai/gpt-oss-20b': 'GPT-OSS 20B',
  'qwen/qwen3.6-27b': 'Qwen3.6 27B',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
};

export function formatModelLabel(model?: string): string {
  if (!model) return '';
  return MODEL_DISPLAY_NAMES[model] || model;
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
  return formatTokens(usage.totalTokens);
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
  const isVi = language === 'vi';
  if (!status) return isVi ? 'Đang suy nghĩ...' : 'Thinking...';

  const labels: Record<string, { vi: string; en: string }> = {
    analyzing_prompt: { vi: 'Đang suy nghĩ & phân tích yêu cầu', en: 'Analyzing prompt' },
    compressing_image: { vi: 'Đang nén ảnh', en: 'Compressing image' },
    uploading_image: { vi: 'Đang gửi ảnh', en: 'Uploading image' },
    gemini_reading_image: { vi: 'Gemini đang phân tích ảnh', en: 'Gemini is analyzing image' },
    direct_response: { vi: 'Đang trả kết quả trực tiếp', en: 'Returning direct result' },
    checking_calendar: { vi: 'Đang tra cứu lịch gia đình', en: 'Checking calendar' },
    updating_calendar: { vi: 'Đang cập nhật lịch gia đình', en: 'Updating calendar' },
    fetching_weather: { vi: 'Đang tra cứu dự báo thời tiết', en: 'Fetching weather' },
    fetching_gold_price: { vi: 'Đang cập nhật giá vàng hôm nay', en: 'Fetching gold price' },
    searching_market: { vi: 'Đang tra cứu giá thị trường', en: 'Searching market prices' },
    searching_notes: { vi: 'Đang tìm trong sổ tay gia đình', en: 'Searching family notes' },
    checking_tasks: { vi: 'Đang kiểm tra danh sách việc', en: 'Checking task list' },
    checking_football: { vi: 'Đang tra cứu lịch thi đấu bóng đá', en: 'Checking football schedule' },
    executing_tool: { vi: 'Đang tra cứu dữ liệu bổ sung', en: 'Fetching extra data' },
    building_menu: { vi: 'Đang gợi ý thực đơn món ăn', en: 'Building menu' },
    reading_horoscope: { vi: 'Đang xem tử vi', en: 'Reading horoscope' },
    reading_image: { vi: 'Đang đọc hình ảnh', en: 'Reading image' },
    generating_answer: { vi: 'Đang suy luận & soạn câu trả lời', en: 'Reasoning & generating answer' },
    model_call: { vi: 'Đang xử lý thông tin', en: 'Processing information' },
    model_stream_open: { vi: 'Đang mở luồng phản hồi', en: 'Opening response stream' },
  };

  const matched = labels[status];
  if (matched) return isVi ? matched.vi : matched.en;
  return status;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
