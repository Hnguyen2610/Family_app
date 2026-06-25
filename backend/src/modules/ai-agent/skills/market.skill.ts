import { Injectable, Logger } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { AiIntent } from '../ai-intent-router';
import { formatGoldPriceForUser, toolSuccess, toolError } from '../ai-tool-results';
import { fetchGoldPrice } from '../helpers/gold-price.helper';
import { normalizeSearchText } from '../ai-intent-router';

@Injectable()
export class MarketSkill implements AiSkill {
  private readonly logger = new Logger(MarketSkill.name);
  name = 'MarketSkill';

  canHandle(intent: AiIntent): boolean {
    return intent === 'gold_price';
  }

  getSystemPrompt(_context: AiSkillContext): string {
    // Return only ADDITIONAL rules; base prompt is composed in orchestrator
    return `GOLD PRICE RULES:\n- Call getGoldPrice immediately for any gold/vàng/SJC/DOJI/PNJ/XAUUSD question.\n- Present the result clearly with source and timestamp.`;
  }

  getTools(): AiSkillTool[] {
    return [{
      type: 'function',
      function: {
        name: 'getGoldPrice',
        description: 'Fetch real-time gold prices in Vietnam (SJC, DOJI, PNJ) in VND and international XAUUSD.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }];
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    const rawMsg = context.userMessage;
    const msg = normalizeSearchText(rawMsg);
    const isSimple = msg.includes('gia vang') || msg.includes('vang bao nhieu') || msg.includes('sjc');
    if (!isSimple) return undefined;

    try {
      const result = await fetchGoldPrice();
      return { content: formatGoldPriceForUser(result), direct: true };
    } catch (e: any) {
      this.logger.error(`MarketSkill direct answer error: ${e.message}`);
      return undefined;
    }
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
