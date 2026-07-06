import {
  addRequestFeedback,
  appendRequestLog,
  configureAiRequestLogPersistence,
  getFeedbackStats,
  getFilteredRequestLogs,
  getLogStats,
  getTopRetrievedRagSources,
  updateRequestLog,
  type AiFeedbackValue,
} from './ai-request-log';

type DirectRequestLogInput = {
  type: 'chat' | 'stream';
  intent: string;
  skill?: string;
  model?: string;
  cached?: boolean;
  userId?: string;
  familyId: string;
  sessionId?: string;
};

export type AiTelemetryFilters = {
  model?: string;
  skill?: string;
  status?: 'ok' | 'error' | 'cached';
  familyId?: string;
  hasRag?: 'true' | 'false';
};

export function appendDirectAiRequestLog(input: DirectRequestLogInput) {
  return appendRequestLog({
    type: input.type,
    intent: input.intent,
    skill: input.skill,
    model: input.model || 'direct',
    latencyMs: 0,
    cached: input.cached || false,
    redacted: false,
    userId: input.userId,
    familyId: input.familyId,
    sessionId: input.sessionId,
  });
}

export async function getAiRequestTelemetry(filters: AiTelemetryFilters) {
  const [logStats, feedbackStats, logs, topRetrievedRagSources] = await Promise.all([
    getLogStats(),
    getFeedbackStats(),
    getFilteredRequestLogs(50, filters),
    getTopRetrievedRagSources(10),
  ]);

  return {
    logs,
    logStats,
    feedbackStats,
    topRetrievedRagSources,
  };
}

export {
  addRequestFeedback,
  appendRequestLog,
  configureAiRequestLogPersistence,
  updateRequestLog,
  type AiFeedbackValue,
};
