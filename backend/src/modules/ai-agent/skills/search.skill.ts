import { Injectable, Logger } from '@nestjs/common';
import { AiIntent } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { toolSuccess, toolError } from '../ai-tool-runtime';
import { FootballScheduleSearchHelper } from '../helpers/football-schedule-search.helper';

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilyResult[];
  detail?: unknown;
  error?: unknown;
  message?: unknown;
};

type SearchSource = {
  title?: string;
  url?: string;
  content?: string;
  rawContent?: string;
};

type SearchResult = {
  answer?: string;
  sources: SearchSource[];
};

@Injectable()
export class SearchSkill implements AiSkill {
  name = 'SearchSkill';
  private readonly logger = new Logger(SearchSkill.name);
  private readonly apiKey = process.env.TAVILY_API_KEY;
  private readonly footballSchedule = new FootballScheduleSearchHelper();

  canHandle(intent: AiIntent): boolean {
    return intent === 'web_search';
  }

  getSystemPrompt(_context: AiSkillContext): string {
    return [
      'WEB SEARCH RULES:',
      '- IMPORTANT: You MUST use the search tool for questions about news, dates, specific facts, or real-time information.',
      '- Do NOT say you do not know without trying the tool first.',
      '- Summarize search results clearly and cite sources.',
    ].join('\n');
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

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    const query = this.cleanQuery(context.userMessage);
    if (!query) {
      return { content: 'Bạn muốn mình tra cứu thông tin gì?', direct: true };
    }

    try {
      const result = await this.performSearch(query);
      return {
        content: this.formatSearchResult(query, result),
        direct: true,
      };
    } catch (error: any) {
      this.logger.error(`Tavily direct search error: ${error.message}`);
      return {
        content: `Không tra cứu được thông tin lúc này: ${error.message}`,
        direct: true,
      };
    }
  }

  async executeTool(toolName: string, args: any, _context: AiSkillContext): Promise<any> {
    if (toolName === 'search') {
      try {
        const data = await this.performSearch(args.query);
        return toolSuccess(toolName, data);
      } catch (error: any) {
        return toolError(toolName, error.message);
      }
    }
  }

  private cleanQuery(query: string) {
    return (query || '')
      .replace(/^\s*(web search:|internet search:|tra cuu internet:|tim kiem internet:)\s*/i, '')
      .trim();
  }

  private buildTavilyQuery(query: string) {
    const clean = this.cleanQuery(query);
    const normalized = this.normalizeVietnamese(clean);
    const asksWhenTeamPlays =
      /\bda\s+(hom nao|khi nao|luc nao|ngay nao|may gio)\b/.test(normalized) ||
      /\b(hom nao|khi nao|luc nao|ngay nao|may gio)\b.*\bda\b/.test(normalized);
    const schedulePrefix = asksWhenTeamPlays
      ? 'Tra cuu tran tiep theo sap toi cua doi bong/doi tuyen duoc nhac trong cau hoi theo gio Viet Nam. Neu cau hoi nhac ten quoc gia, uu tien doi tuyen quoc gia, khong lay giai VDQG.'
      : 'Tra cuu lich thi dau bong da theo gio Viet Nam.';
    const base = this.footballSchedule.isScheduleQuery(clean) || normalized.includes('bong da') || normalized.includes('world cup')
      ? `${schedulePrefix} Tra loi bang tieng Viet. Chi lay ngay gio, giai dau, hai doi. Khong lay tran da qua, khong mo ta, khong nhan dinh, khong nguon dai. Cau hoi: ${clean}`
      : clean;
    return base.length > 380 ? base.slice(0, 380) : base;
  }

  private async performSearch(query: string) {
    if (!this.apiKey) throw new Error('TAVILY_API_KEY missing');
    const searchQuery = this.buildTavilyQuery(query);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query: searchQuery,
        include_answer: true,
        include_raw_content: true,
        max_results: 10,
        search_depth: 'advanced',
      }),
    });

    const data = await response.json().catch(() => ({})) as TavilyResponse;
    let finalResponse = response;
    let finalData: TavilyResponse = data;

    if (!finalResponse.ok && finalResponse.status === 400) {
      this.logger.warn(`Tavily advanced search returned 400, retrying basic search: ${this.stringifyApiError(finalData?.detail || finalData?.error || finalData?.message)}`);
      finalResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          include_answer: true,
          max_results: 5,
          search_depth: 'basic',
        }),
      });
      finalData = await finalResponse.json().catch(() => ({})) as TavilyResponse;
    }

    if (!finalResponse.ok) {
      const detail = finalData?.detail || finalData?.error || finalData?.message;
      const detailText = this.stringifyApiError(detail);
      throw new Error(detailText ? `Tavily API returned ${finalResponse.status}: ${detailText}` : `Tavily API returned ${finalResponse.status}`);
    }

    return {
      answer: finalData.answer,
      sources: (finalData.results || []).slice(0, 10).map((result: TavilyResult) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        rawContent: result.raw_content,
      })),
    };
  }

  private formatSearchResult(query: string, result: SearchResult) {
    const answer = String(result?.answer || '').trim();
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    if (this.footballSchedule.isScheduleQuery(query)) {
      return this.footballSchedule.formatScheduleResult(query, answer, sources);
    }

    const fallback = sources
      .map((source: SearchSource, index: number) => {
        const title = source?.title || `Nguồn ${index + 1}`;
        const content = source?.content ? ` - ${String(source.content).slice(0, 160)}` : '';
        return `${index + 1}. ${title}${content}`;
      })
      .join('\n');

    const sourceLines = sources
      .filter((source: SearchSource) => source?.url)
      .slice(0, 2)
      .map((source: SearchSource, index: number) => {
        const title = source?.title ? `${source.title}: ` : '';
        return `${index + 1}. ${title}${source.url}`;
      })
      .join('\n');

    const body = answer || fallback || `Không tìm thấy kết quả phù hợp cho: ${query}`;
    return sourceLines ? `${body}\n\nNguồn:\n${sourceLines}` : body;
  }

  private stringifyApiError(value: unknown) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private normalizeVietnamese(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\u0111/g, 'd')
      .replace(/\u0110/g, 'D')
      .toLowerCase();
  }
}
