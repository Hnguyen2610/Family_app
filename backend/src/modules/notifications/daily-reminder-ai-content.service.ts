import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { DailyReminderEventContext } from './notification-email-formatters';
import { AiModelClientsService } from '../ai-agent/services/ai-model-clients.service';

type DailyReminderAiItem = DailyReminderEventContext & {
  index: number;
};

@Injectable()
export class DailyReminderAiContentService {
  private readonly logger = new Logger(DailyReminderAiContentService.name);

  constructor(
    @Inject(forwardRef(() => AiModelClientsService))
    private readonly modelClients: AiModelClientsService,
  ) {}

  async enrichEvents(events: any[], today: Date, audienceName: string): Promise<any[]> {
    if (!events.length) return events;

    try {
      const contexts = await this.generateContexts(events, today, audienceName);
      return events.map((event, index) => ({
        ...event,
        dailyReminderContext: contexts.get(index),
      }));
    } catch (error) {
      this.logger.warn(`Daily reminder AI context generation failed: ${error}`);
      return events;
    }
  }

  private async generateContexts(events: any[], today: Date, audienceName: string) {
    const prompt = `
Ngày hôm nay: ${this.formatDate(today)}.
Đối tượng nhận nhắc: ${audienceName}.

Danh sách sự kiện cần viết nội dung nhắc:
${JSON.stringify(events.map((event, index) => ({
  index,
  title: event.title,
  type: event.type,
  description: event.description || '',
  lunarDate: event.lunarDate || '',
  date: event.date ? new Date(event.date).toISOString().slice(0, 10) : '',
})), null, 2)}

Hãy trả về JSON đúng schema:
{
  "items": [
    {
      "index": 0,
      "explanation": "1-2 câu giải thích ngắn gọn",
      "advice": "1 câu lời khuyên hoặc lời nhắn nhủ tổng quan"
    }
  ]
}
`;

    const systemInstruction = this.getSystemInstruction();
    const items = await this.generateItemsWithFallback(systemInstruction, prompt);
    return new Map(items.map((item) => [
      item.index,
      {
        explanation: item.explanation.trim(),
        advice: item.advice?.trim() || undefined,
      },
    ]));
  }

  private async generateItemsWithFallback(systemInstruction: string, prompt: string) {
    try {
      return this.parseItems(await this.generateWithGroq(systemInstruction, prompt));
    } catch (groqError) {
      this.logger.warn(`Daily reminder Groq JSON generation failed, falling back to Gemini: ${groqError}`);
      return this.parseItems(await this.generateWithGemini(systemInstruction, prompt));
    }
  }

  private async generateWithGroq(systemInstruction: string, prompt: string) {
    const response = await this.modelClients.openai.chat.completions.create({
      model: this.modelClients.groqModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 900,
    });

    return response.choices[0].message.content || '';
  }

  private async generateWithGemini(systemInstruction: string, prompt: string) {
    const model = this.modelClients.gemini.getGenerativeModel({
      model: this.modelClients.geminiModel,
      systemInstruction,
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  private getSystemInstruction() {
    return `
Bạn là trợ lý Gia đình AI, viết nội dung cho thông báo nhắc ngày lễ/sự kiện hằng ngày bằng tiếng Việt.

Nguyên tắc:
1. Với HOLIDAY: giải thích vì sao có ngày lễ/ngày kỷ niệm đó, nêu nguồn gốc hoặc ý nghĩa văn hóa/lịch sử phổ biến. Nếu không chắc chi tiết, nói theo hướng "thường được hiểu/gắn với", không bịa mốc cụ thể.
2. Với BIRTHDAY, ANNIVERSARY, TASK, APPOINTMENT, GENERAL: giải thích vì sao hệ thống nhắc sự kiện đó dựa trên tiêu đề/mô tả, rồi đưa một lời nhắn thực tế để người nhận chuẩn bị.
3. Văn phong ấm áp, tự nhiên, giống một trợ lý gia đình chu đáo; không mê tín, không phán đoán tương lai.
4. Ngắn gọn: explanation tối đa 2 câu, advice tối đa 1 câu.
5. Chỉ trả về JSON hợp lệ, không markdown, không HTML, không giải thích ngoài JSON.
`;
  }

  private parseItems(rawText: string): DailyReminderAiItem[] {
    const jsonText = this.extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => ({
        index: Number(item.index),
        explanation: String(item.explanation || '').trim(),
        advice: item.advice ? String(item.advice).trim() : undefined,
      }))
      .filter((item) => Number.isInteger(item.index) && item.explanation.length > 0);
  }

  private extractJson(rawText: string) {
    const withoutFences = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const arrayStart = withoutFences.indexOf('[');
    const arrayEnd = withoutFences.lastIndexOf(']');
    const objectStart = withoutFences.indexOf('{');
    const objectEnd = withoutFences.lastIndexOf('}');
    if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart)) {
      return withoutFences.slice(arrayStart, arrayEnd + 1);
    }

    if (objectStart >= 0 && objectEnd > objectStart) {
      return withoutFences.slice(objectStart, objectEnd + 1);
    }

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return withoutFences.slice(arrayStart, arrayEnd + 1);
    }

    return withoutFences;
  }

  private formatDate(date: Date) {
    return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  }
}
