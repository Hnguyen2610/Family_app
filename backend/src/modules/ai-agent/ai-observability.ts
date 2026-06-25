import { Logger } from '@nestjs/common';

export type AiTrace = {
  requestId: string;
  startedAt: number;
  mode: 'chat' | 'stream';
  model: string;
  firstTokenLogged?: boolean;
  res?: any;
};

export function createAiTrace(mode: AiTrace['mode'], model: string, res?: any): AiTrace {
  return {
    requestId: `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
    mode,
    model,
    res,
  };
}


export function logAiMetric(
  logger: Logger,
  event: string,
  trace: AiTrace | undefined,
  details: Record<string, unknown> = {}
) {
  logger.log(
    JSON.stringify({
      scope: 'ai',
      event,
      requestId: trace?.requestId,
      mode: trace?.mode,
      model: trace?.model,
      elapsedTotalMs: trace ? Date.now() - trace.startedAt : undefined,
      ...details,
    })
  );
}

export async function measureAiStep<T>(
  logger: Logger,
  event: string,
  trace: AiTrace | undefined,
  details: Record<string, unknown>,
  work: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await work();
    logAiMetric(logger, event, trace, {
      ...details,
      status: 'success',
      elapsedMs: Date.now() - startedAt,
    });
    return result;
  } catch (error: any) {
    logAiMetric(logger, event, trace, {
      ...details,
      status: 'error',
      elapsedMs: Date.now() - startedAt,
      error: error?.message || 'Unknown error',
    });
    throw error;
  }
}
