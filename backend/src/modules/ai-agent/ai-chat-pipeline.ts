import { AiIntentRoute } from './ai-intent-router';
import { AiSkillContext } from './interfaces/ai-skill.interface';

type BuildModelInputParams = {
  familyId: string;
  skillContext: AiSkillContext;
  finalUserMessage: string;
  userId: string;
  intentRoute: AiIntentRoute;
  sessionId?: string;
  trace?: any;
  image?: string;
  systemPromptOverride: string;
  toolsOverride?: any[];
  res?: any;
};

export function getPrimaryUserId(userIds: string[] = []) {
  return userIds[0] || '';
}

export function buildAiModelInput(params: BuildModelInputParams) {
  return {
    familyId: params.familyId,
    history: params.skillContext.history || [],
    familyInfo: params.skillContext.familyContext || '',
    finalUserMessage: params.finalUserMessage,
    userId: params.userId,
    intentRoute: params.intentRoute,
    sessionId: params.sessionId,
    trace: params.trace,
    image: params.image,
    res: params.res,
    systemPromptOverride: params.systemPromptOverride,
    toolsOverride: params.toolsOverride && params.toolsOverride.length > 0 ? params.toolsOverride : undefined,
  };
}
