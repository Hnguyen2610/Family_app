import { Logger } from '@nestjs/common';
import { normalizeSearchText } from './ai-intent-router';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { toolError } from './ai-tool-results';

export function shouldAllowKnowledgeWriteTool(context: AiSkillContext) {
  const normalized = normalizeSearchText(context.userMessage || '');
  return /\b(luu|nho|ghi nho|long memory|so tay|rag|save|remember)\b/.test(normalized);
}

export function shouldAllowGeneralMemoryTools(context: AiSkillContext) {
  const normalized = normalizeSearchText(context.userMessage || '');
  return /\b(luu|nho|ghi nho|so tay|long memory|rag|save|remember|toi thich|minh thich|khong thich|di ung|so thich|ghi chu)\b/.test(normalized);
}

export function getSkillToolsForContext(skill: any, context: AiSkillContext) {
  if (!skill.getTools) return [];
  if (skill.name === 'FamilyKnowledgeSkill' && !shouldAllowKnowledgeWriteTool(context)) return [];
  if (skill.name === 'GeneralChatSkill' && !shouldAllowGeneralMemoryTools(context)) return [];
  return skill.getTools();
}

export function isSideEffectTool(toolName: string) {
  return ['createEvent', 'updateEvent', 'deleteEvent', 'createWikiEntry'].includes(toolName);
}

export function shouldAllowSideEffectTool(toolName: string, context: AiSkillContext) {
  if (!isSideEffectTool(toolName)) return true;
  if (toolName === 'createWikiEntry') return shouldAllowKnowledgeWriteTool(context);

  const normalized = normalizeSearchText(context.userMessage || '');
  if (toolName === 'createEvent') return /\b(tao|them|len lich|dat lich|nhac|create|add|schedule)\b/.test(normalized);
  if (toolName === 'updateEvent') return /\b(sua|cap nhat|doi|update|edit)\b/.test(normalized);
  if (toolName === 'deleteEvent') return /\b(xoa|huy|delete|remove|cancel)\b/.test(normalized);
  return false;
}

export function buildFallbackExecuteTool(logger: Logger) {
  return async (toolName: string, _args: any, _familyId: string, _userId: string): Promise<any> => {
    logger.warn(`Fallback executeTool called for: ${toolName}`);
    return toolError(toolName, 'Tool not handled by any skill.');
  };
}
