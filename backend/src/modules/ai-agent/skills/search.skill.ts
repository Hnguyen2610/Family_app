import { Injectable, Logger } from '@nestjs/common';
import { AiIntent } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillTool } from '../interfaces/ai-skill.interface';
import { toolSuccess, toolError } from '../ai-tool-results';

@Injectable()
export class SearchSkill implements AiSkill {
  name = 'SearchSkill';
  private readonly logger = new Logger(SearchSkill.name);
  private readonly apiKey = process.env.TAVILY_API_KEY;

  canHandle(intent: AiIntent): boolean {
    return intent === 'web_search';
  }

  getSystemPrompt(context: AiSkillContext): string {
    return `🔍 WEB SEARCH RULES:
- IMPORTANT: You MUST use the 'internetSearch' tool for ANY question about news, dates, specific facts, or real-time information (e.g., "how many teams", "latest price", "weather").
- Do NOT say you don't know without trying the tool first.
- Summarize search results clearly and cite sources.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search internet.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
    ];
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    if (toolName === 'search') {
      try {
        if (!this.apiKey) throw new Error('TAVILY_API_KEY missing');
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.apiKey,
            query: args.query,
            include_answer: true,
            max_results: 5,
          }),
        });
        const data = await response.json() as any;
        return toolSuccess('internetSearch', {
          answer: data.answer,
          sources: data.results?.map((r: any) => r.url),
        });
      } catch (error: any) {
        return toolError(toolName, error.message);
      }
    }
  }
}
