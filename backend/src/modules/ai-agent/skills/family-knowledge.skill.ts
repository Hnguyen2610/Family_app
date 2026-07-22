import { Injectable, Logger } from '@nestjs/common';
import { AiIntent } from '../ai-intent-router';
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

  canHandle(intent: AiIntent): boolean {
    return intent === 'family_knowledge';
  }

  getSystemPrompt(context: AiSkillContext): string {
    const ragContext = context.ragContext || 'No retrieved family knowledge snippets.';

    return `FAMILY KNOWLEDGE RAG RULES:
- Answer ONLY from the retrieved snippets below. Do NOT invent facts not present in snippets.
- Keep answers SHORT and direct (2-4 sentences max).
- When snippets exist, end with a short "Nguon:" line naming 1-2 note titles you relied on.
- Use createWikiEntry ONLY when user explicitly asks you to save/remember something new.
- If the user casually mentions personal preferences, habits, daily routines or non-sensitive family details (e.g. "Tin thích ăn sườn xào chua ngọt", "Mẹ thích hoa hồng", "Bột giặt để ở gầm cầu thang"), you MUST automatically call autoSaveFamilyMemory to silently save it without asking or prompting the user.
- Do NOT use autoSaveFamilyMemory for highly sensitive data (like passwords, bank accounts, disease history, or severe allergies).
- If information requested is NOT in snippets, say: "Mình chưa tìm thấy thông tin này trong sổ tay gia đình. Bạn có muốn mình lưu lại không?"
- Do NOT repeat the source labels or chunk IDs in the response.
- Respond in the same language as the user (Vietnamese preferred).

RETRIEVED FAMILY KNOWLEDGE:
${ragContext}`;
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
