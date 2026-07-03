import { formatContextSize, formatLatency as formatLatencyValue } from '@/utils/format';

export interface AiRequestLog {
  id: string;
  timestamp: string;
  type: 'chat' | 'stream';
  intent: string;
  skill?: string;
  model: string;
  toolsCalled?: string[];
  ragSnippetCount?: number;
  ragQuery?: string;
  ragMiss?: boolean;
  ragSources?: AiRagSource[];
  latencyMs: number;
  cached: boolean;
  redacted: boolean;
  userId?: string;
  familyId?: string;
  sessionId?: string;
  error?: string;
  fallbackReason?: string;
  tokenCount?: number;
  feedbacks?: AiFeedback[];
}

export interface AiFeedback {
  value: 'correct' | 'wrong' | 'missing_context' | 'wrong_family' | 'wrong_datetime';
  source: 'web' | 'telegram' | 'admin';
  userId?: string;
  comment?: string;
  createdAt: string;
}

export interface AiRagSource {
  documentId: string;
  title: string;
  chunkIndex: number;
  score: number;
  familyId?: string;
  sourceType?: string;
  category?: string;
  retrieval?: string;
  snippet?: string;
}

export interface TopRagSource {
  documentId: string;
  title: string;
  familyId?: string;
  sourceType?: string;
  category?: string;
  hits: number;
  bestScore: number;
  lastRetrievedAt: string;
}

export interface SystemStats {
  cache: { total: number; active: number; expired: number };
  logStats: { total: number; cacheHits: number; errors: number; avgLatencyMs: number };
  recentLogs: AiRequestLog[];
  topRagSources?: TopRagSource[];
  feedback?: {
    total: number;
    byValue: Record<string, number>;
    recent: Array<{
      requestLogId: string;
      timestamp: string;
      intent: string;
      skill?: string;
      model: string;
      familyId?: string;
      userId?: string;
      value: string;
      source: string;
      comment?: string;
    }>;
  };
  models: {
    groq: string;
    gemini: string;
    maxTokens: number;
    historyLimit: number;
    groqContextWindow: number;
    geminiContextWindow: number;
  };
  uptime: number;
  memoryMB: number;
  timestamp: string;
}

export function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatContext(tokens: number) {
  return formatContextSize(tokens);
}

export function formatLatency(ms: number) {
  return formatLatencyValue(ms);
}

export function formatReadableLabel(value?: string) {
  if (!value) return '-';
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getRequestStatus(log: AiRequestLog) {
  if (log.error) {
    return {
      label: 'Cần kiểm tra',
      detail: log.fallbackReason || log.error,
      className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };
  }
  if (log.cached) {
    return {
      label: 'Từ cache',
      detail: 'Trả lại kết quả đã lưu nên gần như không tốn thời gian/model.',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
  }
  return {
    label: 'Hoàn tất',
    detail: 'Request xử lý thành công.',
    className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };
}

export function getRequestSummary(log: AiRequestLog) {
  const skill = formatReadableLabel(log.skill);
  const intent = formatReadableLabel(log.intent);
  const model = log.model === 'direct' ? 'không gọi model' : log.model.toUpperCase();
  const mode = log.type === 'stream' ? 'streaming' : 'chat thường';

  if (log.cached) {
    return `AI trả lời từ cache cho intent ${intent}, không cần xử lý lại.`;
  }

  if (log.error) {
    return `Request ${mode} bị lỗi ở ${skill}.`;
  }

  return `AI dùng ${skill} để xử lý intent ${intent} qua ${model}.`;
}

export function getRagSummary(log: AiRequestLog) {
  const snippets = log.ragSnippetCount || 0;
  const tools = log.toolsCalled?.length || 0;

  if (log.ragMiss) return 'Có tìm RAG nhưng không thấy đoạn ghi chú phù hợp.';
  if (snippets > 0) return `Đã lấy ${snippets} đoạn context từ sổ tay gia đình.`;
  if (tools > 0) return `Đã gọi ${tools} tool, không dùng RAG.`;
  return 'Không gọi tool và không dùng RAG.';
}

export function getFeedbackLabel(value: AiFeedback['value']) {
  const labels: Record<AiFeedback['value'], string> = {
    correct: 'Đúng',
    wrong: 'Sai',
    missing_context: 'Thiếu context',
    wrong_family: 'Sai gia đình',
    wrong_datetime: 'Sai ngày giờ',
  };
  return labels[value] || value;
}

export function getModelBadgeClass(model: string) {
  if (model === 'groq') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (model === 'gemini') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (model === 'direct') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
}
