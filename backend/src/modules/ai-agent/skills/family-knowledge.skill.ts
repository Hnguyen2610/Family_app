import { Injectable, Logger } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { RagService } from '../services/rag.service';
import { toolSuccess, toolError } from '../ai-tool-runtime';

function normalizeTextForSensitivity(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isSensitiveMemory(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  const normalized = normalizeTextForSensitivity(text);

  const sensitiveKeywords = [
    'di ung', 'allergy', 'allergies',
    'benh ', 'om ', 'sot ', 'ho ', 'dau ', 'kham', 'bac si', 'thuoc ', 'don thuoc', 'medical', 'suc khoe', 'health',
    'tien ', 'luong ', 'thu nhap', 'chi tieu', 'ngan hang', 'bank', 'tai khoan', 'mat khau', 'password', 'pin', 'credit',
    'vay ', 'no ', 'finan', 'highly sensitive', 'nhay cam', 'bi mat', 'secret',
  ];

  return sensitiveKeywords.some((keyword) => normalized.includes(keyword));
}

@Injectable()
export class FamilyKnowledgeSkill implements AiSkill {
  name = 'FamilyKnowledgeSkill';
  private readonly logger = new Logger(FamilyKnowledgeSkill.name);

  constructor(
    private readonly ragService: RagService,
  ) {}

  getSystemPrompt(_context: AiSkillContext): string {
    return `FAMILY KNOWLEDGE RAG RULES:
- Call searchFamilyNotes whenever a question needs family-specific context you do not already have — do not guess or invent facts.
- Answer ONLY from what searchFamilyNotes returns. If it returns no matches, say: "Mình chưa tìm thấy thông tin này trong sổ tay gia đình. Bạn có muốn mình lưu lại không?" instead of guessing.
- Keep answers SHORT and direct (2-4 sentences max).
- When you used searchFamilyNotes results, end with a short "Nguon:" line naming 1-2 note titles you relied on.
- Use createWikiEntry ONLY when user explicitly asks you to save/remember something new.
- If the user casually mentions personal preferences, habits, daily routines or non-sensitive family details (e.g. "Tin thích ăn sườn xào chua ngọt", "Mẹ thích hoa hồng", "Bột giặt để ở gầm cầu thang"), you MUST automatically call autoSaveFamilyMemory to silently save it without asking or prompting the user.
- Do NOT use autoSaveFamilyMemory for highly sensitive data (like passwords, bank accounts, disease history, or severe allergies).
- Do NOT repeat the source labels or chunk IDs in the response.
- Respond in the same language as the user (Vietnamese preferred).`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'createWikiEntry',
          description: 'Save new information to the family long-term memory (wiki). Use ONLY when the user explicitly asks to save or remember something.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Brief title for this knowledge' },
              content: { type: 'string', description: 'Detailed information to save' },
              familyId: { type: 'string' },
            },
            required: ['title', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'autoSaveFamilyMemory',
          description: 'Automatically and silently save collected non-sensitive family preferences, habits, routines, or facts into the long-term memory (RAG). Do NOT use if the user explicitly asks to save something (force createWikiEntry in that case). Do NOT use for sensitive financial or health data.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Brief title for the preference/habit (e.g. "Sở thích ăn uống của Tin")' },
              content: { type: 'string', description: 'Detailed fact to remember (e.g. "Tin thích ăn sườn xào chua ngọt ít cay.")' },
            },
            required: ['title', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'searchFamilyNotes',
          description: 'Search the family\'s long-term memory (wiki/notes) for information relevant to the user\'s question — preferences, habits, past events, household facts. Call this whenever the question needs family-specific context you do not already have. Do not guess or invent an answer instead of calling this.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The question or topic to search for, in the user\'s own words.' },
            },
            required: ['query'],
          },
        },
      },
    ];
  }

  private extractExplicitTitle(userMessage: string) {
    const marker = userMessage.match(/(?:v[oớ]i\s+title|title|ti[eê]u\s*[dđ][eề])\s*[:：]?\s*/i);
    if (!marker || marker.index === undefined) return '';

    const start = marker.index + marker[0].length;
    const rest = userMessage.slice(start);
    const stop = rest.search(/(?:\.\s*)?(?:sau\s*[dđ][oó]|r[oồ]i|v[aà]\s+sau\s*[dđ][oó]|sau\s+[dđ][oó]\s+gi[uú]p)/i);
    const title = (stop >= 0 ? rest.slice(0, stop) : rest)
      .replace(/^[\s"']+|[\s"'.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return title.slice(0, 120);
  }

  private buildStableTitle(args: any, context: AiSkillContext) {
    const explicitTitle = this.extractExplicitTitle(context.userMessage || '');
    if (explicitTitle) return explicitTitle;

    const rawTitle = String(args?.title || '').replace(/\s+/g, ' ').trim();
    const content = String(args?.content || '').replace(/\s+/g, ' ').trim();
    return rawTitle || content.slice(0, 80).trim() || 'Ghi chú gia đình';
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    if (toolName === 'searchFamilyNotes') {
      const searchFamilyIds = context.resolvedFamilyId
        ? [context.resolvedFamilyId]
        : (context.userFamilyIds || []);

      if (searchFamilyIds.length === 0) {
        return toolError(toolName, 'Chưa xác định được gia đình để tìm trong sổ tay.');
      }

      const query = String(args?.query || '').trim();
      if (!query) {
        return toolError(toolName, 'Thiếu nội dung cần tìm.');
      }

      const settled = await Promise.allSettled(
        searchFamilyIds.map((familyId) => this.ragService.searchFamilyKnowledge(familyId, query, 3)),
      );

      const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length > 0) {
        this.logger.warn(`searchFamilyNotes: ${failures.length}/${settled.length} family search(es) failed: ${failures.map((f) => f.reason?.message || f.reason).join('; ')}`);
      }

      const succeeded = settled.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<RagService['searchFamilyKnowledge']>>> => result.status === 'fulfilled');
      if (succeeded.length === 0) {
        return toolError(toolName, failures[0]?.reason?.message || 'Không thể tìm trong sổ tay gia đình lúc này.');
      }

      const merged = succeeded
        .flatMap((result) => result.value)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, 3);

      return toolSuccess(toolName, {
        matches: merged.map((result) => ({
          title: result.title,
          snippet: result.content,
        })),
      });
    }

    if (toolName === 'autoSaveFamilyMemory') {
      try {
        const saveFamilyId = context.resolvedFamilyId;
        if (!saveFamilyId) {
          return toolError(toolName, 'Chưa xác định được gia đình để tự động lưu.');
        }

        const title = String(args.title || '').trim();
        const content = String(args.content || '').trim();

        if (isSensitiveMemory(title, content)) {
          return toolSuccess(toolName, {
            success: false,
            message: 'Thông tin này thuộc danh mục nhạy cảm, không thể tự động lưu trực tiếp. Vui lòng xin ý kiến người dùng hoặc đề xuất họ lưu thủ công.',
          });
        }

        this.logger.debug(`autoSaveFamilyMemory: Auto-saving direct entry for familyId=${saveFamilyId}, title=${title}`);
        const result = await this.ragService.createKnowledgeDocument({
          familyId: saveFamilyId,
          title,
          content,
          sourceType: 'ai_chat_saved',
          createdBy: context.userId,
        });

        return toolSuccess(toolName, {
          success: true,
          savedDirectly: true,
          documentId: result?.id,
          message: 'Đã tự động lưu thành công thông tin không nhạy cảm vào sổ tay gia đình.',
        });
      } catch (err: any) {
        return toolError(toolName, err.message);
      }
    }

    if (toolName !== 'createWikiEntry') return undefined;

    try {
      const saveFamilyId = context.resolvedFamilyId;
      if (!saveFamilyId) {
        return {
          needsClarification: true,
          message: 'TOOL_NEEDS_CLARIFICATION: Please ask the user which specific family they want to save this information to before calling this tool again.',
        };
      }

      const title = this.buildStableTitle(args, context);
      const content = String(args.content || '').trim();
      if (isSensitiveMemory(title, content)) {
        return toolSuccess(toolName, {
          consentRequired: true,
          sensitive: true,
          title,
          content,
          familyId: saveFamilyId,
          message: 'Thông tin này có vẻ nhạy cảm. Hãy xin xác nhận của user trước khi lưu vào long memory.',
        });
      }

      this.logger.debug(`createWikiEntry: familyId=${saveFamilyId}, title=${title}`);
      const result = await this.ragService.createKnowledgeDocument({
        familyId: saveFamilyId,
        title,
        content,
        sourceType: 'ai_chat_saved',
        createdBy: context.userId,
      });
      return toolSuccess(toolName, { success: true, documentId: result?.id });
    } catch (err: any) {
      return toolError(toolName, err.message);
    }
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    // Always return undefined to let LLM handle the response conversationally (e.g. when there is no matching RAG wiki entry)
    return undefined;
  }
}
