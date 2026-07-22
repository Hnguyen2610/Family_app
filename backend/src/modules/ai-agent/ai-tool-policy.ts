import { Logger } from '@nestjs/common';
import { normalizeSearchText } from './ai-intent-router';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { toolError } from './ai-tool-runtime';

export function shouldAllowKnowledgeWriteTool(context: AiSkillContext) {
  const normalized = normalizeSearchText(context.userMessage || '');
  return /\b(luu|nho|ghi nho|long memory|so tay|rag|save|remember)\b/.test(normalized);
}

export function shouldAllowKnowledgeOrAutoWrite(context: AiSkillContext) {
  const normalized = normalizeSearchText(context.userMessage || '');
  return /\b(luu|nho|ghi nho|long memory|so tay|rag|save|remember|thich|ghet|di ung|thoi quen|so thich|sinh nhat|tuoi|nha minh|quy tac)\b/.test(normalized);
}

export function shouldAllowGeneralMemoryTools(context: AiSkillContext) {
  const normalized = normalizeSearchText(context.userMessage || '');
  return /\b(luu|nho|ghi nho|so tay|long memory|rag|save|remember|toi thich|minh thich|khong thich|di ung|so thich|ghi chu)\b/.test(normalized);
}

export function getSkillToolsForContext(skill: any, context: AiSkillContext) {
  if (!skill.getTools) return [];
  if (skill.name === 'FamilyKnowledgeSkill' && !shouldAllowKnowledgeOrAutoWrite(context)) return [];
  if (skill.name === 'GeneralChatSkill' && !shouldAllowGeneralMemoryTools(context)) return [];
  return skill.getTools();
}

export function isSideEffectTool(toolName: string) {
  return ['createEvent', 'updateEvent', 'deleteEvent', 'createWikiEntry'].includes(toolName);
}

export function shouldAllowSideEffectTool(toolName: string, context: AiSkillContext) {
  if (!isSideEffectTool(toolName)) return true;
  if (toolName === 'createWikiEntry') return shouldAllowKnowledgeWriteTool(context);

  const normalized = normalizeSideEffectIntentText(context);
  if (toolName === 'createEvent') return /\b(tao|them|len lich|dat lich|nhac|create|add|schedule)\b/.test(normalized);
  if (toolName === 'updateEvent') return /\b(sua|cap nhat|doi|update|edit)\b/.test(normalized);
  if (toolName === 'deleteEvent') return /\b(xoa|huy|delete|remove|cancel)\b/.test(normalized);
  return false;
}

function normalizeSideEffectIntentText(context: AiSkillContext) {
  const current = normalizeSearchText(context.userMessage || '');
  if (!isLikelyClarificationAnswer(current)) return current;

  const recentHistory = (context.history || [])
    .slice(-6)
    .map((message: any) => String(message?.content || ''))
    .join(' ');

  return normalizeSearchText(`${recentHistory} ${context.userMessage || ''}`);
}

function isLikelyClarificationAnswer(normalizedMessage: string) {
  const words = normalizedMessage.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return true;
  return /\b(thu|ngay|hom nay|ngay mai|tuan nay|tuan sau|thang nay|thang sau|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2})\b/.test(normalizedMessage);
}

export function buildFallbackExecuteTool(logger: Logger) {
  return async (toolName: string, _args: any, _familyId: string, _userId: string): Promise<any> => {
    logger.warn(`Fallback executeTool called for: ${toolName}`);
    return toolError(toolName, 'Tool not handled by any skill.');
  };
}
