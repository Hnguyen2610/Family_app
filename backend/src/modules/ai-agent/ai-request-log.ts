/**
 * ai-request-log.ts
 * In-memory circular buffer for AI request logs.
 * Tracks latency, model, intent, cache status, and errors.
 */

export type AiRequestLog = {
  id: string;
  timestamp: string;
  type: 'chat' | 'stream';
  intent: string;
  model: string;
  latencyMs: number;
  cached: boolean;
  redacted: boolean;
  error?: string;
  tokenCount?: number;
};

const MAX_LOGS = 100;
const logs: AiRequestLog[] = [];
let counter = 0;

export function appendRequestLog(entry: Omit<AiRequestLog, 'id' | 'timestamp'>) {
  const log: AiRequestLog = {
    id: `req-${++counter}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  if (logs.length >= MAX_LOGS) {
    logs.shift(); // remove oldest
  }
  logs.push(log);
}

export function getRequestLogs(limit = 50): AiRequestLog[] {
  return logs.slice(-limit).reverse(); // most recent first
}

export function getLogStats() {
  if (logs.length === 0) return { total: 0, cacheHits: 0, errors: 0, avgLatencyMs: 0 };

  const cacheHits = logs.filter(l => l.cached).length;
  const errors = logs.filter(l => !!l.error).length;
  const avgLatencyMs = Math.round(
    logs.filter(l => !l.cached).reduce((sum, l) => sum + l.latencyMs, 0) /
    Math.max(1, logs.filter(l => !l.cached).length)
  );

  return { total: logs.length, cacheHits, errors, avgLatencyMs };
}
