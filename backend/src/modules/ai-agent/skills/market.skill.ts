import { Injectable, Logger } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { formatGoldPriceForUser, toolSuccess, toolError } from '../ai-tool-runtime';
import { fetchGoldPrice } from '../helpers/gold-price.helper';
import { normalizeSearchText } from '../ai-intent-router';

@Injectable()
export class MarketSkill implements AiSkill {
  private readonly logger = new Logger(MarketSkill.name);
  name = 'MarketSkill';

  getSystemPrompt(_context: AiSkillContext): string {
    return `GOLD PRICE RULES:
- Present the result clearly with source and timestamp.`;
  }

  getTools(): AiSkillTool[] {
    return [{
      type: 'function',
      function: {
        name: 'getGoldPrice',
        description: 'Fetch real-time gold prices in Vietnam (SJC, DOJI, PNJ) in VND and international XAUUSD. Always call this for gold price questions — never answer from memory, prices change constantly.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }];
  }

  // LLM-first: always let the LLM call getGoldPrice tool
  async tryDirectAnswer(_context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    return undefined;
  }

  async executeTool(toolName: string, _args: any, _context: AiSkillContext): Promise<any> {
    if (toolName !== 'getGoldPrice') return undefined;
    try {
      return toolSuccess(toolName, await fetchGoldPrice());
    } catch (e: any) {
      return toolError(toolName, e.message || 'Error fetching gold price');
    }
  }
}
