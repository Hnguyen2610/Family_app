import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiSkillRegistry } from '../skills/ai-skill-registry';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { composeFullPrompt } from '../ai-agent-prompt';
import { getSkillToolsForContext } from '../ai-tool-policy';
import { mergeUniqueTools } from '../ai-tool-dispatcher';
import { AiModelClientsService } from './ai-model-clients.service';

@Injectable()
export class AiEvalService {
  private readonly logger = new Logger(AiEvalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly modelClients: AiModelClientsService,
  ) {}

  async createEvalDraftFromLog(input: {
    requestLogId: string;
    group?: string;
    expectedIntent?: string;
    expectedSkill?: string;
    expectedFamilyId?: string;
    note?: string;
  }) {
    if (!input.requestLogId) return { ok: false, error: 'requestLogId is required' };

    // Try to find from DB first, then in-memory buffer
    let log: any = null;
    if (this.prisma.aiRequestLog) {
      try {
        log = await this.prisma.aiRequestLog.findUnique({
          where: { id: input.requestLogId },
          include: { feedbacks: { orderBy: { createdAt: 'asc' } } },
        });
      } catch {
        // fall through to in-memory
      }
    }

    if (!log) {
      return { ok: false, error: 'Request log not found. It may have expired from the in-memory buffer.' };
    }

    try {
      const evalCase = await this.prisma.aiEvalCase.create({
        data: {
          input: log.prompt || '',
          expectedIntent: input.expectedIntent || log.intent || null,
          expectedSkill: input.expectedSkill || log.skill || null,
          expectedTool: log.toolsCalled?.[0] || null,
          sourceLogId: log.id,
          status: 'ACTIVE',
        },
      });

      this.logger.log(`[EvalDraft] Created active eval case ${evalCase.id} from request log ${input.requestLogId}`);
      return { ok: true, evalCase };
    } catch (err: any) {
      this.logger.error(`Failed to save eval case to database: ${err.message}`, err);
      return { ok: false, error: `Database save failed: ${err.message}` };
    }
  }

  async getEvalCases() {
    return this.prisma.aiEvalCase.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async runEvalCases() {
    const cases = await this.prisma.aiEvalCase.findMany({
      where: { status: 'ACTIVE' },
    });

    const allSkills = this.skillRegistry.getAllSkills();
    const toolOwners = this.skillRegistry.getAllToolOwners();
    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (const testCase of cases) {
      const skillContext: AiSkillContext = {
        userId: 'eval-user',
        familyId: 'eval-family',
        resolvedFamilyId: 'eval-family',
        userMessage: testCase.input,
        intent: 'general_chat',
        familyContext: '',
        memoryContext: '',
        ragContext: '',
        ragSources: [],
        history: [],
        source: 'web',
      };
      const combinedTools = mergeUniqueTools(
        ...allSkills.map((candidateSkill) => getSkillToolsForContext(candidateSkill, skillContext)),
      );

      let actualTool: string | undefined;
      let callError: string | undefined;
      try {
        const response = await this.modelClients.openai.chat.completions.create({
          model: this.modelClients.groqModel,
          messages: [
            { role: 'system', content: composeFullPrompt(this.skillRegistry, skillContext) },
            { role: 'user', content: testCase.input },
          ],
          tools: combinedTools as any,
          max_tokens: 300,
        });
        actualTool = response.choices[0]?.message?.tool_calls?.[0]?.function?.name;
      } catch (err: any) {
        callError = err?.message || 'Unknown error';
        this.logger.warn(`[EvalRun] Model call failed for case ${testCase.id}: ${callError}`);
      }

      const errors: string[] = [];
      if (callError) errors.push(`Model call failed: ${callError}`);
      if (!callError && testCase.expectedTool && actualTool !== testCase.expectedTool) {
        errors.push(`Expected tool ${testCase.expectedTool}, got ${actualTool || 'none'}`);
      }

      const passed = errors.length === 0;
      if (passed) passCount++;
      else failCount++;

      results.push({
        id: testCase.id,
        input: testCase.input,
        expectedTool: testCase.expectedTool,
        actualTool: actualTool || null,
        actualSkill: actualTool ? toolOwners.get(actualTool)?.name || null : null,
        passed,
        errors,
      });
    }

    return {
      passCount,
      failCount,
      results,
    };
  }

  async updateEvalCase(id: string, data: any) {
    return this.prisma.aiEvalCase.update({
      where: { id },
      data,
    });
  }

  async deleteEvalCase(id: string) {
    return this.prisma.aiEvalCase.delete({
      where: { id },
    });
  }
}
