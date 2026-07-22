import { formatContextSize, formatLatency as formatLatencyValue } from '@/utils/format';

export interface AiRequestLog {
  id: string;
  timestamp: string;
  type: 'chat' | 'stream';
  source?: string;
  intent: string;
  prompt?: string;
  normalizedPrompt?: string;
  skill?: string;
  model: string;
  routeReason?: string;
  routeConfidence?: number;
  toolsCalled?: string[];
  ragSnippetCount?: number;
  ragQuery?: string;
  ragMiss?: boolean;
  ragSources?: AiRagSource[];
  resolverTelemetry?: Record<string, unknown>;
  proposedAction?: Record<string, unknown>;
  sanitizerIncidents?: Array<Record<string, unknown>>;
  needsClarification?: boolean;
  latencyMs: number;
  cached: boolean;
  redacted: boolean;
  userId?: string;
  familyId?: string;
  sessionId?: string;
  error?: string;
  fallbackReason?: string;
  modelChoiceReason?: string;
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
  evalDrafts?: Array<{
    id: string;
    sourceRequestLogId: string;
    group: string;
    expected: {
      intent?: string;
      skill?: string;
      familyId?: string;
    };
    metadata: Record<string, unknown>;
  }>;
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
      label: 'Can kiem tra',
      detail: log.fallbackReason || log.error,
      className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };
  }
  if (log.cached) {
    return {
      label: 'Tu cache',
      detail: 'Tra lai ket qua da luu nen gan nhu khong ton thoi gian/model.',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
  }
  if (log.needsClarification) {
    return {
      label: 'Can lam ro',
      detail: 'AI da dung lai de hoi them thay vi doan.',
      className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
  }
  return {
    label: 'Hoan tat',
    detail: 'Request xu ly thanh cong.',
    className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };
}

export function getRequestSummary(log: AiRequestLog) {
  const skill = formatReadableLabel(log.skill);
  const intent = formatReadableLabel(log.intent);
  const model = log.model === 'direct' ? 'khong goi model' : log.model.toUpperCase();
  const mode = log.type === 'stream' ? 'streaming' : 'chat thuong';
  const reason = log.modelChoiceReason ? ` Ly do chon model: ${log.modelChoiceReason}.` : '';
  const route = log.routeReason ? ` Route: ${log.routeReason}.` : '';

  if (log.cached) {
    return `AI tra loi tu cache cho intent ${intent}, khong can xu ly lai.${reason}${route}`;
  }

  if (log.error) {
    return `Request ${mode} bi loi o ${skill}.${reason}${route}`;
  }

  return `AI dung ${skill} de xu ly intent ${intent} qua ${model}.${reason}${route}`;
}

export function getRagSummary(log: AiRequestLog) {
  const snippets = log.ragSnippetCount || 0;
  const tools = log.toolsCalled?.length || 0;

  if (log.ragMiss) return 'Co tim RAG nhung khong thay doan ghi chu phu hop.';
  if (snippets > 0) return `Da lay ${snippets} doan context tu so tay gia dinh.`;
  if (tools > 0) return `Da goi ${tools} tool, khong dung RAG.`;
  return 'Khong goi tool va khong dung RAG.';
}

export function getFeedbackLabel(value: AiFeedback['value']) {
  const labels: Record<AiFeedback['value'], string> = {
    correct: 'Dung',
    wrong: 'Sai',
    missing_context: 'Thieu context',
    wrong_family: 'Sai gia dinh',
    wrong_datetime: 'Sai ngay gio',
  };
  return labels[value] || value;
}

export function getModelBadgeClass(model: string) {
  if (model === 'groq') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (model === 'gemini') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (model === 'direct') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
}
