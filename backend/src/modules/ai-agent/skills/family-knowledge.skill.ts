import { Injectable } from '@nestjs/common';
import { AiIntent } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse } from '../interfaces/ai-skill.interface';

@Injectable()
export class FamilyKnowledgeSkill implements AiSkill {
  name = 'FamilyKnowledgeSkill';

  canHandle(intent: AiIntent): boolean {
    return intent === 'family_knowledge';
  }

  getSystemPrompt(context: AiSkillContext): string {
    const ragContext = context.ragContext || 'No retrieved family knowledge snippets.';

    return `FAMILY KNOWLEDGE RAG RULES:
- Answer using the retrieved family knowledge snippets below.
- If the snippets are not enough, say that the family wiki does not have this information yet.
- Do not invent private family details that are not present in the snippets.
- Keep the answer concise and include source titles when useful.

RETRIEVED FAMILY KNOWLEDGE:
${ragContext}`;
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    if (context.ragContext) return undefined;

    return {
      content: 'Minh chua tim thay thong tin phu hop trong family wiki. Ban co the them ghi chu/tai lieu gia dinh truoc, roi minh se dung phan do de tra loi chinh xac hon.',
      direct: true,
    };
  }
}
