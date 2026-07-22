import { AiSkillContext } from './interfaces/ai-skill.interface';
import { repairToolArgs, toolError, toolValidationError, validateToolArgs } from './ai-tool-runtime';
import { isSideEffectTool } from './ai-tool-policy';

type AiLogger = {
  debug(message: string): void;
  warn(message: string): void;
};

type ToolSchema = {
  function?: {
    name?: string;
  };
};

type SkillWithTools = {
  name?: string;
  executeTool?: (toolName: string, args: any, context: AiSkillContext) => Promise<any>;
};

type BaseExecuteTool = (toolName: string, args: any, familyId: string, userId: string) => Promise<any>;
type CreateActionProposal = (toolName: string, args: any, context: AiSkillContext) => Promise<any>;

export function mergeUniqueTools(...toolLists: ToolSchema[][]): ToolSchema[] {
  const tools: ToolSchema[] = [];

  for (const toolList of toolLists) {
    for (const tool of toolList || []) {
      const name = tool.function?.name;
      if (!name || tools.some((existing) => existing.function?.name === name)) continue;
      tools.push(tool);
    }
  }

  return tools;
}

function prepareToolCall(toolName: string, args: any, tools: ToolSchema[], logger: AiLogger) {
  const repairedArgs = repairToolArgs(toolName, args, tools as any[]);
  const validation = validateToolArgs(toolName, repairedArgs, tools as any[]);
  if (validation.ok) return { args: repairedArgs };

  logger.warn(`[ToolValidation] ${toolName}: ${validation.errors.join('; ')}`);
  return { error: toolValidationError(toolName, validation.errors) };
}

export function createSkillToolDispatcher(options: {
  label: string;
  logger: AiLogger;
  tools: ToolSchema[];
  skill: SkillWithTools;
  knowledgeSkill?: SkillWithTools;
  context: AiSkillContext;
  baseExecuteTool: BaseExecuteTool;
  shouldAllowSideEffectTool: (toolName: string) => boolean;
  createActionProposal?: CreateActionProposal;
}): BaseExecuteTool {
  const {
    label,
    logger,
    tools,
    skill,
    knowledgeSkill,
    context,
    baseExecuteTool,
    shouldAllowSideEffectTool,
    createActionProposal,
  } = options;

  return async (toolName: string, args: any, familyId: string, userId: string) => {
    logger.debug(`[${label}] Executing tool: ${toolName}`);
    const prepared = prepareToolCall(toolName, args, tools, logger);
    if ('error' in prepared) return prepared.error;

    const safeArgs = prepared.args;
    if (!shouldAllowSideEffectTool(toolName)) {
      return toolError(toolName, 'This action needs an explicit create/update/delete/save request before it can run.');
    }

    if (createActionProposal && isSideEffectTool(toolName)) {
      if ((toolName === 'updateEvent' || toolName === 'deleteEvent') && !safeArgs?.id) {
        return toolError(toolName, 'Cần xác định chính xác sự kiện trước khi cập nhật hoặc xóa. Hãy gửi thêm ngày, giờ hoặc chọn sự kiện trong lịch.');
      }
      const proposal = await createActionProposal(toolName, safeArgs, context);
      logger.debug(`[${label}] ${toolName} converted to action proposal`);
      return proposal;
    }

    if (skill.executeTool) {
      const result = await skill.executeTool(toolName, safeArgs, context);
      if (result !== undefined) {
        logger.debug(`[${label}] ${toolName} handled by ${skill.name}`);
        return result;
      }
    }

    if (knowledgeSkill?.executeTool) {
      const result = await knowledgeSkill.executeTool(toolName, safeArgs, context);
      if (result !== undefined) {
        logger.debug(`[${label}] ${toolName} handled by FamilyKnowledgeSkill`);
        return result;
      }
    }

    logger.warn(`[${label}] No skill handled tool: ${toolName}, using baseExecuteTool`);
    return baseExecuteTool(toolName, safeArgs, familyId, userId);
  };
}
