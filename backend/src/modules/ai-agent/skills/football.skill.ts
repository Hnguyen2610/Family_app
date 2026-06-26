import { Injectable, Logger } from '@nestjs/common';
import { AiIntent } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillTool } from '../interfaces/ai-skill.interface';
import { toolSuccess, toolError } from '../ai-tool-results';

@Injectable()
export class FootballSkill implements AiSkill {
  name = 'FootballSkill';
  private readonly logger = new Logger(FootballSkill.name);
  private readonly apiKey = process.env.FOOTBALL_DATA_API_KEY;
  private readonly baseUrl = 'https://api.football-data.org/v4';

  private readonly leagueMap: Record<string, string> = {
    'ngoai hang anh': 'PL', 'premier league': 'PL',
    'la liga': 'PD', 'tay ban nha': 'PD',
    'bundesliga': 'BL1', 'duc': 'BL1',
    'serie a': 'SA', 'y': 'SA',
    'champions league': 'CL', 'c1': 'CL',
    'ligue 1': 'FL1', 'phap': 'FL1',
    'world cup': 'WC', 'the gioi': 'WC',
  };

  canHandle(intent: AiIntent): boolean {
    return intent === 'football';
  }

  getSystemPrompt(context: AiSkillContext): string {
    return `⚽ FOOTBALL ASSISTANT:
- Use get_matches for fixtures/results.
- Use get_standings for league tables.
- Valid leagues: PL, PD, BL1, SA, CL, WC.
- If unsure or API fails, tell user you will search the web instead.
- Be enthusiastic like a sportscaster! Use icons like ⚽ 🏟️ 🏆.
- When show results, highlight winners.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_matches',
          description: 'Get football match schedules or results.',
          parameters: {
            type: 'object',
            properties: {
              league: { type: 'string', description: 'PL, PD, BL1, SA, CL, WC' },
              status: { type: 'string', description: 'SCHEDULED, LIVE, or FINISHED' },
            },
            required: ['league'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_standings',
          description: 'Get league table/standings.',
          parameters: {
            type: 'object',
            properties: {
              league: { type: 'string', description: 'League code' },
            },
            required: ['league'],
          },
        },
      },
    ];
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    const leagueCode = this.resolveLeagueCode(args.league);
    if (!leagueCode) return toolError(toolName, `Không tìm thấy mã giải đấu cho "${args.league}".`);

    try {
      if (toolName === 'get_matches') {
        const status = args.status || 'SCHEDULED';
        return await this.fetchApi(`${this.baseUrl}/competitions/${leagueCode}/matches?status=${status}`, toolName);
      }
      if (toolName === 'get_standings') {
        return await this.fetchApi(`${this.baseUrl}/competitions/${leagueCode}/standings`, toolName);
      }
    } catch (error: any) {
      return toolError(toolName, error.message);
    }
  }

  private resolveLeagueCode(input: string): string | undefined {
    const normalized = (input || '').toLowerCase().trim();
    if (['PL', 'PD', 'BL1', 'SA', 'CL', 'WC'].includes(normalized.toUpperCase())) return normalized.toUpperCase();
    return this.leagueMap[normalized];
  }

  private async fetchApi(url: string, toolName: string) {
    if (!this.apiKey) throw new Error('API Key missing');
    const response = await fetch(url, { headers: { 'X-Auth-Token': this.apiKey } });
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as any;
      throw new Error(err.message || 'API Error');
    }
    const data = await response.json() as any;
    if (toolName === 'get_matches') {
      return toolSuccess(toolName, (data.matches || []).slice(0, 10).map((m: any) => ({
        date: m.utcDate, teams: `${m.homeTeam.name} vs ${m.awayTeam.name}`, score: `${m.score.fullTime.home}-${m.score.fullTime.away}`
      })));
    }
    return toolSuccess(toolName, data);
  }
}
