import { Injectable, Logger } from '@nestjs/common';
import { AiIntent, normalizeSearchText } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { MealsService } from '../../meals/meals.service';
import { formatMenuForUser } from '../ai-tool-runtime';
import { toolSuccess, toolError } from '../ai-tool-runtime';

@Injectable()
export class MealSkill implements AiSkill {
  private readonly logger = new Logger(MealSkill.name);
  name = 'MealSkill';

  constructor(private readonly mealsService: MealsService) {}

  canHandle(intent: AiIntent): boolean {
    return intent === 'meal_suggestion';
  }

  getSystemPrompt(context: AiSkillContext): string {
    const memory = context.memoryContext ? `\nUSER PREFERENCES FROM MEMORY:\n${context.memoryContext}` : '';
    return `MEAL RULES:
- ALWAYS call generateFamilyMenu tool for meal/food suggestions. Do NOT answer from memory or assumptions.
- Present the menu naturally with main dish, vegetable, and soup if available.${memory}`;
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

  // LLM-first: always let the LLM call generateFamilyMenu tool
  async tryDirectAnswer(_context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    return undefined;
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
