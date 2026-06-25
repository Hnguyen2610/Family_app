import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { AiIntent, normalizeSearchText } from '../ai-intent-router';
import { MealsService } from '../../meals/meals.service';
import { formatMenuForUser, toolSuccess, toolError } from '../ai-tool-results';

@Injectable()
export class MealSkill implements AiSkill {
  name = 'MealSkill';

  constructor(
    @Inject(forwardRef(() => MealsService))
    private readonly mealsService: MealsService,
  ) {}

  canHandle(intent: AiIntent): boolean {
    return intent === 'meal_suggestion';
  }

  getSystemPrompt(context: AiSkillContext): string {
    const memory = context.memoryContext ? `\nUSER PREFERENCES FROM MEMORY:\n${context.memoryContext}` : '';
    return `MEAL RULES:\n- Call generateFamilyMenu when the user asks what to eat, meal ideas, menu, or family menu suggestions.\n- Present the menu naturally with main dish, vegetable, and soup if available.${memory}`;
  }

  getTools(): AiSkillTool[] {
    return [{
      type: 'function',
      function: {
        name: 'generateFamilyMenu',
        description: 'Generates a random, balanced family menu (Main Course, Vegetable, Soup) based on family preferences.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }];
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    if (context.ragContext) return undefined;

    const msg = normalizeSearchText(context.userMessage);
    const isSimple = msg.includes('an gi') || msg.includes('an toi') || msg.includes('thuc don') || msg.includes('goi y mon');
    if (!isSimple) return undefined;

    const result = await this.mealsService.generateFamilyMenu(context.familyId);
    return { content: formatMenuForUser(result), direct: true };
  }

  async executeTool(toolName: string, _args: any, context: AiSkillContext): Promise<any> {
    if (toolName !== 'generateFamilyMenu') return undefined;
    try {
      return toolSuccess(toolName, await this.mealsService.generateFamilyMenu(context.familyId));
    } catch (e: any) {
      return toolError(toolName, e.message || 'Error generating menu');
    }
  }
}
