import { Injectable } from '@nestjs/common';
import { addRequestFeedback, getAiRequestTelemetry, type AiFeedbackValue } from '../ai-request-log';
import { getSessionCacheStats } from '../ai-cache';
import { AiModelClientsService } from './ai-model-clients.service';

@Injectable()
export class AiStatsService {
  private readonly aiMaxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '800', 10);
  private readonly historyLimit = Number.parseInt(process.env.AI_HISTORY_LIMIT || '6', 10);
  private readonly groqContextWindow = Number.parseInt(process.env.GROQ_CONTEXT_WINDOW || '131072', 10);
  private readonly geminiContextWindow = Number.parseInt(process.env.GEMINI_CONTEXT_WINDOW || '1048576', 10);

  constructor(private readonly modelClients: AiModelClientsService) {}

  async getSystemStats(filters: { model?: string; skill?: string; status?: 'ok' | 'error' | 'cached'; familyId?: string; hasRag?: 'true' | 'false' } = {}) {
    const telemetry = await getAiRequestTelemetry(filters);

    return {
      cache: getSessionCacheStats(),
      logStats: telemetry.logStats,
      feedback: telemetry.feedbackStats,
      recentLogs: telemetry.logs,
      topRagSources: telemetry.topRetrievedRagSources,
      models: {
        groq: this.modelClients.groqModel,
        gemini: this.modelClients.geminiModel,
        maxTokens: this.aiMaxTokens,
        historyLimit: this.historyLimit,
        groqContextWindow: this.groqContextWindow,
        geminiContextWindow: this.geminiContextWindow,
      },
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  }

  async addFeedback(input: {
    requestLogId: string;
    value: AiFeedbackValue;
    source?: 'web' | 'telegram' | 'admin';
    userId?: string;
    comment?: string;
  }) {
    const allowed: AiFeedbackValue[] = ['correct', 'wrong', 'missing_context', 'wrong_family', 'wrong_datetime'];
    if (!input.requestLogId || !allowed.includes(input.value)) {
      return { ok: false, error: 'Invalid feedback payload' };
    }

    const log = await addRequestFeedback(input.requestLogId, {
      value: input.value,
      source: input.source || 'web',
      userId: input.userId,
      comment: input.comment,
    });
    if (!log) return { ok: false, error: 'Request log not found or expired' };
    return { ok: true, requestLogId: log.id, feedbackCount: log.feedbacks?.length || 0 };
  }
}
