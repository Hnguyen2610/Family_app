/**
 * ai-request-log.ts
 * AI request log persistence helpers.
 * Keeps a small in-memory buffer for fast fallback and mirrors records to DB for admin reports.
 */

export type AiRequestLog = {
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
  ragSources?: AiRagLogSource[];
  latencyMs: number;
  cached: boolean;
  redacted: boolean;
  userId?: string;
  familyId?: string;
  sessionId?: string;
  error?: string;
  fallbackReason?: string;
  tokenCount?: number;
  feedbacks?: AiRequestFeedback[];
};

export type AiFeedbackValue = 'correct' | 'wrong' | 'missing_context' | 'wrong_family' | 'wrong_datetime';

export type AiRequestFeedback = {
  value: AiFeedbackValue;
  source: 'web' | 'telegram' | 'admin';
  userId?: string;
  comment?: string;
  createdAt: string;
};

export type AiRequestLogFilters = {
  model?: string;
  skill?: string;
  status?: 'ok' | 'error' | 'cached';
  familyId?: string;
  hasRag?: 'true' | 'false';
};

export type AiRagLogSource = {
  documentId: string;
  title: string;
  chunkIndex: number;
  score: number;
  familyId?: string;
  sourceType?: string;
  category?: string;
  retrieval?: string;
  snippet?: string;
};

const MAX_LOGS = 200;
const logs: AiRequestLog[] = [];
let counter = 0;
let prismaClient: any;

export function configureAiRequestLogPersistence(prisma: any) {
  prismaClient = prisma;
}

function mapDbFeedback(feedback: any): AiRequestFeedback {
  return {
    value: feedback.value,
    source: feedback.source,
    userId: feedback.userId || undefined,
    comment: feedback.comment || undefined,
    createdAt: feedback.createdAt instanceof Date ? feedback.createdAt.toISOString() : String(feedback.createdAt),
  };
}

function mapDbLog(row: any): AiRequestLog {
  return {
    id: row.id,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    type: row.type,
    intent: row.intent,
    skill: row.skill || undefined,
    model: row.model,
    toolsCalled: row.toolsCalled || undefined,
    ragSnippetCount: row.ragSnippetCount ?? undefined,
    ragQuery: row.ragQuery || undefined,
    ragMiss: row.ragMiss ?? undefined,
    ragSources: Array.isArray(row.ragSources) ? row.ragSources : undefined,
    latencyMs: row.latencyMs || 0,
    cached: Boolean(row.cached),
    redacted: Boolean(row.redacted),
    userId: row.userId || undefined,
    familyId: row.familyId || undefined,
    sessionId: row.sessionId || undefined,
    error: row.error || undefined,
    fallbackReason: row.fallbackReason || undefined,
    tokenCount: row.tokenCount ?? undefined,
    feedbacks: row.feedbacks?.map(mapDbFeedback) || undefined,
  };
}

function toDbLog(log: AiRequestLog) {
  return {
    id: log.id,
    timestamp: new Date(log.timestamp),
    type: log.type,
    intent: log.intent,
    skill: log.skill || null,
    model: log.model,
    toolsCalled: log.toolsCalled || [],
    ragSnippetCount: log.ragSnippetCount ?? null,
    ragQuery: log.ragQuery || null,
    ragMiss: log.ragMiss ?? null,
    ragSources: log.ragSources || undefined,
    latencyMs: log.latencyMs || 0,
    cached: Boolean(log.cached),
    redacted: Boolean(log.redacted),
    userId: log.userId || null,
    familyId: log.familyId || null,
    sessionId: log.sessionId || null,
    error: log.error || null,
    fallbackReason: log.fallbackReason || null,
    tokenCount: log.tokenCount ?? null,
  };
}

async function persistLog(log: AiRequestLog) {
  if (!prismaClient?.aiRequestLog) return;

  try {
    const data = toDbLog(log);
    await prismaClient.aiRequestLog.upsert({
      where: { id: log.id },
      create: data,
      update: data,
    });
  } catch (error) {
    console.warn('[ai-request-log] Failed to persist AI request log', error);
  }
}

async function persistFeedback(requestLogId: string, feedback: AiRequestFeedback) {
  if (!prismaClient?.aiRequestFeedback) return false;

  try {
    await prismaClient.aiRequestFeedback.create({
      data: {
        requestLogId,
        value: feedback.value,
        source: feedback.source,
        userId: feedback.userId || null,
        comment: feedback.comment || null,
        createdAt: new Date(feedback.createdAt),
      },
    });
    return true;
  } catch (error) {
    console.warn('[ai-request-log] Failed to persist AI feedback', error);
    return false;
  }
}

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
  void persistLog(log);
  return log;
}

export async function addRequestFeedback(
  requestLogId: string,
  feedback: Omit<AiRequestFeedback, 'createdAt'>,
) {
  const log = logs.find((item) => item.id === requestLogId);

  const nextFeedback: AiRequestFeedback = {
    ...feedback,
    createdAt: new Date().toISOString(),
  };
  if (log) {
    log.feedbacks = [...(log.feedbacks || []), nextFeedback];
    await persistLog(log);
  }

  const persisted = await persistFeedback(requestLogId, nextFeedback);
  if (!log && !persisted) return null;

  if (!log && prismaClient?.aiRequestLog) {
    const dbLog = await prismaClient.aiRequestLog.findUnique({
      where: { id: requestLogId },
      include: { feedbacks: { orderBy: { createdAt: 'asc' } } },
    });
    return dbLog ? mapDbLog(dbLog) : null;
  }

  return log || { id: requestLogId, feedbacks: [nextFeedback] };
}

export function updateRequestLog(requestLogId: string, patch: Partial<Omit<AiRequestLog, 'id' | 'timestamp'>>) {
  const log = logs.find((item) => item.id === requestLogId);
  if (!log) return null;
  Object.assign(log, patch);
  void persistLog(log);
  return log;
}

export async function getFeedbackStats() {
  if (prismaClient?.aiRequestFeedback) {
    try {
      const [groups, recentRows] = await Promise.all([
        prismaClient.aiRequestFeedback.groupBy({
          by: ['value'],
          _count: { value: true },
        }),
        prismaClient.aiRequestFeedback.findMany({
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { requestLog: true },
        }),
      ]);

      const byValue: Record<AiFeedbackValue, number> = {
        correct: 0,
        wrong: 0,
        missing_context: 0,
        wrong_family: 0,
        wrong_datetime: 0,
      };
      for (const group of groups) {
        if (group.value in byValue) byValue[group.value as AiFeedbackValue] = group._count.value;
      }

      return {
        total: Object.values(byValue).reduce((sum, value) => sum + value, 0),
        byValue,
        recent: recentRows.map((feedback: any) => ({
          requestLogId: feedback.requestLogId,
          timestamp: feedback.createdAt instanceof Date ? feedback.createdAt.toISOString() : String(feedback.createdAt),
          intent: feedback.requestLog?.intent || '-',
          skill: feedback.requestLog?.skill || undefined,
          model: feedback.requestLog?.model || '-',
          familyId: feedback.requestLog?.familyId || undefined,
          userId: feedback.userId || feedback.requestLog?.userId || undefined,
          value: feedback.value,
          source: feedback.source,
          comment: feedback.comment || undefined,
        })),
      };
    } catch (error) {
      console.warn('[ai-request-log] Failed to read AI feedback stats from DB', error);
    }
  }

  const byValue: Record<AiFeedbackValue, number> = {
    correct: 0,
    wrong: 0,
    missing_context: 0,
    wrong_family: 0,
    wrong_datetime: 0,
  };
  const recent: Array<{
    requestLogId: string;
    timestamp: string;
    intent: string;
    skill?: string;
    model: string;
    familyId?: string;
    userId?: string;
    value: AiFeedbackValue;
    source: AiRequestFeedback['source'];
    comment?: string;
  }> = [];

  for (const log of logs) {
    for (const feedback of log.feedbacks || []) {
      byValue[feedback.value] += 1;
      recent.push({
        requestLogId: log.id,
        timestamp: feedback.createdAt,
        intent: log.intent,
        skill: log.skill,
        model: log.model,
        familyId: log.familyId,
        userId: feedback.userId || log.userId,
        value: feedback.value,
        source: feedback.source,
        comment: feedback.comment,
      });
    }
  }

  return {
    total: recent.length,
    byValue,
    recent: recent.slice(-20).reverse(),
  };
}

export function getRequestLogs(limit = 50): AiRequestLog[] {
  return logs.slice(-limit).reverse(); // most recent first
}

export async function getFilteredRequestLogs(limit = 50, filters: AiRequestLogFilters = {}): Promise<AiRequestLog[]> {
  if (prismaClient?.aiRequestLog) {
    try {
      const where: any = {};
      if (filters.model) where.model = filters.model;
      if (filters.skill) where.skill = filters.skill;
      if (filters.familyId) where.familyId = filters.familyId;
      if (filters.status === 'cached') where.cached = true;
      if (filters.status === 'error') where.error = { not: null };
      if (filters.status === 'ok') {
        where.cached = false;
        where.error = null;
      }
      if (filters.hasRag === 'true') where.ragSnippetCount = { gt: 0 };
      if (filters.hasRag === 'false') {
        where.OR = [{ ragSnippetCount: null }, { ragSnippetCount: 0 }];
      }

      const rows = await prismaClient.aiRequestLog.findMany({
        where,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { feedbacks: { orderBy: { createdAt: 'asc' } } },
      });
      return rows.map(mapDbLog);
    } catch (error) {
      console.warn('[ai-request-log] Failed to read AI request logs from DB', error);
    }
  }

  return logs
    .filter((log) => !filters.model || log.model === filters.model)
    .filter((log) => !filters.skill || log.skill === filters.skill)
    .filter((log) => !filters.familyId || log.familyId === filters.familyId)
    .filter((log) => {
      if (!filters.hasRag) return true;
      const hasRag = Boolean(log.ragSnippetCount && log.ragSnippetCount > 0);
      return filters.hasRag === 'true' ? hasRag : !hasRag;
    })
    .filter((log) => {
      if (!filters.status) return true;
      if (filters.status === 'cached') return log.cached;
      if (filters.status === 'error') return !!log.error;
      return !log.error && !log.cached;
    })
    .slice(-limit)
    .reverse();
}

export async function getTopRetrievedRagSources(limit = 10) {
  const sourceLogs = prismaClient?.aiRequestLog
    ? await prismaClient.aiRequestLog.findMany({
        where: { ragSnippetCount: { gt: 0 } },
        take: 500,
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true, ragSources: true },
      }).catch((error: any) => {
        console.warn('[ai-request-log] Failed to read top RAG sources from DB', error);
        return null;
      })
    : null;

  const counts = new Map<string, {
    documentId: string;
    title: string;
    familyId?: string;
    sourceType?: string;
    category?: string;
    hits: number;
    bestScore: number;
    lastRetrievedAt: string;
  }>();

  const iterableLogs = Array.isArray(sourceLogs)
    ? sourceLogs.map((row: any) => ({
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
        ragSources: Array.isArray(row.ragSources) ? row.ragSources : [],
      }))
    : logs;

  for (const log of iterableLogs) {
    for (const source of log.ragSources || []) {
      const key = source.documentId;
      const current = counts.get(key);
      if (current) {
        current.hits += 1;
        current.bestScore = Math.max(current.bestScore, source.score || 0);
        current.lastRetrievedAt = log.timestamp;
      } else {
        counts.set(key, {
          documentId: source.documentId,
          title: source.title,
          familyId: source.familyId,
          sourceType: source.sourceType,
          category: source.category,
          hits: 1,
          bestScore: source.score || 0,
          lastRetrievedAt: log.timestamp,
        });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.hits - a.hits || b.bestScore - a.bestScore)
    .slice(0, limit);
}

export async function getLogStats() {
  if (prismaClient?.aiRequestLog) {
    try {
      const rows = await prismaClient.aiRequestLog.findMany({
        take: 500,
        orderBy: { timestamp: 'desc' },
        select: {
          intent: true,
          skill: true,
          cached: true,
          error: true,
          latencyMs: true,
        },
      });
      if (rows.length === 0) return { total: 0, cacheHits: 0, errors: 0, avgLatencyMs: 0, byIntent: {}, bySkill: {} };

      const cacheHits = rows.filter((log: any) => log.cached).length;
      const errors = rows.filter((log: any) => !!log.error).length;
      const nonCached = rows.filter((log: any) => !log.cached);
      const avgLatencyMs = Math.round(
        nonCached.reduce((sum: number, log: any) => sum + (log.latencyMs || 0), 0) / Math.max(1, nonCached.length),
      );

      const byIntent: Record<string, number> = {};
      const bySkill: Record<string, number> = {};
      for (const log of rows) {
        byIntent[log.intent] = (byIntent[log.intent] || 0) + 1;
        if (log.skill) bySkill[log.skill] = (bySkill[log.skill] || 0) + 1;
      }

      return { total: rows.length, cacheHits, errors, avgLatencyMs, byIntent, bySkill };
    } catch (error) {
      console.warn('[ai-request-log] Failed to read AI log stats from DB', error);
    }
  }

  if (logs.length === 0) return { total: 0, cacheHits: 0, errors: 0, avgLatencyMs: 0, byIntent: {} };

  const cacheHits = logs.filter(l => l.cached).length;
  const errors = logs.filter(l => !!l.error).length;
  const avgLatencyMs = Math.round(
    logs.filter(l => !l.cached).reduce((sum, l) => sum + l.latencyMs, 0) /
    Math.max(1, logs.filter(l => !l.cached).length)
  );

  const byIntent: Record<string, number> = {};
  for (const log of logs) {
    byIntent[log.intent] = (byIntent[log.intent] || 0) + 1;
  }

  const bySkill: Record<string, number> = {};
  for (const log of logs) {
    if (log.skill) bySkill[log.skill] = (bySkill[log.skill] || 0) + 1;
  }

  return { total: logs.length, cacheHits, errors, avgLatencyMs, byIntent, bySkill };
}
