import { Injectable } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillTool } from '../interfaces/ai-skill.interface';
import { AiIntent } from '../ai-intent-router';

@Injectable()
export class GeneralChatSkill implements AiSkill {
  name = 'GeneralChatSkill';

  canHandle(_intent: AiIntent): boolean {
    return true;
  }

  getSystemPrompt(_context: AiSkillContext): string {
    return `GENERAL CHAT MEMORY RULES:
- You can use AI MEMORY to personalize answers.
- If the user shares a short personal preference or health restriction, use updateAiMemory to ask for permission to remember it.
- If the user shares long-form reusable family knowledge, routines, rules, school/health notes, or household context, use proposeFamilyNote to ask for permission to save it into Family Notes/RAG.
- Never save memory or RAG knowledge without user confirmation.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'updateAiMemory',
          description: 'Propose remembering a short personal preference or family memory. This asks for user confirmation before saving.',
          parameters: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['foodLikes', 'foodDislikes', 'healthRestrictions', 'familyNotes'],
                description: 'Memory category',
              },
              value: {
                type: 'string',
                description: 'Short value to remember, for example "Pho bo" instead of "I like pho bo".',
              },
            },
            required: ['type', 'value'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'proposeFamilyNote',
          description: 'Propose saving long-form reusable family knowledge to Family Notes/RAG. This only asks for user confirmation; it does not save automatically.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short title for the note.',
              },
              content: {
                type: 'string',
                description: 'Useful long-form family knowledge to save. Keep it factual and self-contained.',
              },
              category: {
                type: 'string',
                enum: ['family', 'health', 'school', 'meal', 'finance', 'other'],
                description: 'Suggested Family Notes category.',
              },
            },
            required: ['title', 'content', 'category'],
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: any, context: AiSkillContext): Promise<any> {
    if (name === 'updateAiMemory' && context.trace?.res) {
      context.trace.res.write(`data: ${JSON.stringify({
        type: 'memory_consent_request',
        memory: { type: args.type, value: args.value },
      })}\n\n`);

      return {
        status: 'SUCCESS',
        message: 'A consent request has been sent to the user. Do NOT save until they confirm.',
      };
    }

    if (name === 'proposeFamilyNote' && context.trace?.res) {
      context.trace.res.write(`data: ${JSON.stringify({
        type: 'rag_consent_request',
        note: {
          title: args.title,
          content: args.content,
          category: args.category || 'family',
        },
      })}\n\n`);

      return {
        status: 'SUCCESS',
        message: 'A Family Notes/RAG consent request has been sent to the user. Do NOT save until they confirm.',
      };
    }
  }
}
