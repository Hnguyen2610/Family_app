import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { OpenAI } from 'openai';
import { ChatService } from './chat.service';
import { MealsService } from '../../meals/meals.service';
import { EventsService } from '../../events/events.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { getSolarDateFromLunar } from '../../../utils/lunar-calendar.util';

@Injectable()
export class AiAgentService {
  private openai: OpenAI;

  constructor(
    private chatService: ChatService,
    private mealsService: MealsService,
    private eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  // Define tools for the AI agent
  private getTools() {
    return [
      {
        type: 'function' as const,
        function: {
          name: 'generateFamilyMenu',
          description: 'Generates a random, balanced family menu (Main Course, Vegetable, Soup) based on family preferences and recent history.',
          parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'getGoldPrice',
          description: 'Fetch real-time gold prices in Vietnam (SJC, XAUUSD) in VND and USD. MUST be called when user asks about gold price, giá vàng, or precious metal prices.',
          parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'getEventsByMonth',
          description: 'Get all events for a specific month',
          parameters: {
            type: 'object' as const,
            properties: {
              familyId: {
                type: 'string',
                description: 'Family ID',
              },
              month: {
                type: 'number',
                description: 'Month (1-12)',
              },
              year: {
                type: 'number',
                description: 'Year',
              },
            },
            required: ['familyId', 'month', 'year'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'createEvent',
          description: 'Create a new event in the family calendar. Use ONLY when the user explicitly asks to "tạo", "thêm", or "lên lịch" an event. NEVER use this tool automatically if the user just asks for information or a reading.',
          parameters: {
            type: 'object' as const,
            properties: {
              title: {
                type: 'string',
                description: 'Event title',
              },
              description: {
                type: 'string',
                description: 'Event description',
              },
              date: {
                type: 'string',
                description: 'Event date in YYYY-MM-DD format',
              },
              type: {
                type: 'string',
                enum: ['BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'APPOINTMENT', 'TASK', 'GENERAL'],
                description: 'Type of event',
              },
            },
            required: ['title', 'date'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'updateEvent',
          description: 'Update an existing event. Use this to change title, date, or description of an event.',
          parameters: {
            type: 'object' as const,
            properties: {
              id: { type: 'string', description: 'Event ID' },
              familyId: { type: 'string', description: 'Family ID' },
              title: { type: 'string', description: 'New title' },
              description: { type: 'string', description: 'New description' },
              date: { type: 'string', description: 'New date in YYYY-MM-DD format' },
              type: {
                type: 'string',
                enum: ['BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'APPOINTMENT', 'TASK', 'GENERAL'],
                description: 'New type',
              },
            },
            required: ['id', 'familyId'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'deleteEvent',
          description: 'Delete an event from the calendar.',
          parameters: {
            type: 'object' as const,
            properties: {
              id: { type: 'string', description: 'Event ID' },
              familyId: { type: 'string', description: 'Family ID' },
            },
            required: ['id', 'familyId'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'getSolarDateFromLunar',
          description: 'Convert a lunar date (day/month) to a solar date for a specific year. Use this when the user asks for a lunar date, like "9 tháng 3 âm".',
          parameters: {
            type: 'object' as const,
            properties: {
              day: { type: 'number', description: 'Lunar day' },
              month: { type: 'number', description: 'Lunar month' },
              year: { type: 'number', description: 'Target year' },
            },
            required: ['day', 'month', 'year'],
          },
        },
      },
    ];
  }

  private getSystemPrompt(familyInfo: string = ''): string {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const dayName = days[now.getDay()];

    return `You are a helpful family assistant AI. Today's date is ${today} (${dayName}).
You have access to tools that you MUST use to help the user. Never say you cannot do something if a tool exists for it.
When creating events, pay close attention to the day of the week to avoid calculation errors. For example, if today is Monday the 23rd, "this Sunday" is the 29th.

CRITICAL RULES FOR TOOLS:
1. NO NESTED TOOL CALLS: Never try to call a tool inside the arguments of another tool. 
2. SEQUENTIAL EXECUTION: If you need to convert a date (e.g., from Lunar to Solar) before creating an event, YOU MUST:
   a. Call getSolarDateFromLunar first.
   b. Use the result from the first call to call createEvent in the NEXT step.
3. USER INTENT: Only create events when explicitly asked ("thêm", "tạo", "lên lịch").

AVAILABLE TOOLS AND WHEN TO USE THEM:
1. getGoldPrice - Call this IMMEDIATELY when user asks about gold price, "giá vàng", precious metals, or anything related to gold prices. This tool fetches REAL-TIME data.
2. createEvent - Call this when user wants to create, add, or schedule any event in the calendar.
3. getEventsByMonth - Call this when user asks about events in a specific month.
4. generateFamilyMenu - Call this when user asks "hôm nay ăn gì", or wants meal/menu suggestions. It generates a perfectly balanced combo of a Main Course, Vegetable, and Soup based on family preferences.

AVAILABLE SUB-AGENTS (PERSONAS):
1. Chuyên gia Tử Vi (Horoscope Expert): Automatically adopt this persona whenever the user asks about "tử vi", "xem bói", "cung hoàng đạo", "phong thủy", or specific astrology/fortune-telling questions.
When acting as the Horoscope Expert:
- Address the user warmly but mysteriously.
- Provide detailed astrological readings based on your vast knowledge of Eastern (Tử Vi Đẩu Số, Bát Tự) and Western (Zodiac) astrology.
- Make sure to use the exact birthdates of the family members provided below.
- Include sections like: Tổng quan (Overview), Sự nghiệp (Career), Tình duyên (Romance), Sức khỏe (Health).
- Always end with a positive, encouraging piece of advice or feng-shui tip.
- IMPORTANT: DO NOT call the createEvent tool for horoscope readings unless the user explicitly asks to "Save this reading to my calendar".

FAMILY MEMBERS INFORMATION (For personalized answers and Horoscope):
${familyInfo ? familyInfo : 'Không có thông tin thành viên.'}

CRITICAL RULES:
- You MUST use your tools. NEVER say "I cannot access real-time information" — you CAN via your tools.
- When user asks "giá vàng" or "gold price", call getGoldPrice immediately.
- When user asks to create an event, call createEvent immediately.
- When the user mentions a birthday, use type BIRTHDAY.
- If the user gives a date like "21/3", convert it to ${today.substring(0, 4)}-MM-DD format.
- Always respond in the same language as the user.
- After calling a tool, present the results clearly and naturally.`;
  }

  async chat(familyId: string, userMessage: string, userIds: string[] = [], image?: string) {
    try {
      let finalUserMessage = userMessage || '[Đã gửi hình ảnh]';

      if (image) {
        try {
          const visionResponse = await this.openai.chat.completions.create({
            model: 'llama-3.2-90b-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Mô tả chi tiết và đọc bất kỳ văn bản/dữ liệu nào trong hình ảnh này bằng tiếng Việt.' },
                  { type: 'image_url', image_url: { url: image } }
                ]
              }
            ]
          });
          const desc = visionResponse.choices[0]?.message?.content;
          if (desc) {
            finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng đã đính kèm một hình ảnh chứa nội dung sau: ${desc}]`;
          }
        } catch (visionError) {
          console.error('Vision processing error:', visionError);
          finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng có đính kèm ảnh nhưng gặp lỗi khi phân tích.]`;
        }
      }

      // Save user message
      await this.chatService.saveMessage(familyId, 'user', finalUserMessage);

      // Build user profiles for the prompt context
      const allUsers = await this.prisma.user.findMany({ where: { familyId } });
      const familyInfo = allUsers
        .map(
          (u) =>
            `- ${u.name} (Vai trò: ${u.role || 'Chưa rõ'}, Ngày sinh dương lịch: ${
              u.birthday ? u.birthday.toISOString().split('T')[0] : 'Chưa cập nhật'
            })`
        )
        .join('\n');

      // Get chat history (last 10 messages)
      const history = await this.chatService.getHistory(familyId, undefined, 10);
      const messages: any[] = [
        { role: 'system', content: this.getSystemPrompt(familyInfo) },
        ...history.reverse().map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      ];

      // Add current user message
      messages.push({
        role: 'user',
        content: finalUserMessage,
      });

      // Call LLM with tools
      let response = await this.openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: this.getTools() as any,
        tool_choice: 'auto',
      });

      let assistantContent = '';
      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls || [];
      console.log('AI Response Tool Calls:', toolCalls.length > 0 ? toolCalls.map(dc => dc.function.name) : 'NONE');

      // Process tool calls
      if (toolCalls.length > 0) {
        // Add the assistant message with tool_calls
        messages.push(choice.message);

        for (const toolCall of toolCalls) {
          const result = await this.executeTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            familyId,
            userIds,
          );
          console.log(`Tool Result (${toolCall.function.name}):`, result);

          // Add tool result with proper role
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        // Get final response after tool calls
        response = await this.openai.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages,
        });

        assistantContent = response.choices[0].message.content || 'Unable to process request';
      } else {
        assistantContent = response.choices[0].message.content || 'No response';
      }

      // Save assistant response
      await this.chatService.saveMessage(familyId, 'assistant', assistantContent);

      return {
        content: assistantContent,
        familyId,
      };
    } catch (error) {
      console.error('AI Agent Error:', error);
      throw new HttpException(
        'Failed to process AI request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async chatStream(familyId: string, userMessage: string, userIds: string[], res: any, sessionId?: string, image?: string) {
    try {
      let finalUserMessage = userMessage || '[Đã gửi hình ảnh]';

      if (image) {
        try {
          const visionResponse = await this.openai.chat.completions.create({
            model: 'llama-3.2-90b-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Mô tả chi tiết và đọc bất kỳ văn bản/dữ liệu nào trong hình ảnh này bằng tiếng Việt.' },
                  { type: 'image_url', image_url: { url: image } }
                ]
              }
            ]
          });
          const desc = visionResponse.choices[0]?.message?.content;
          if (desc) {
            finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng đã đính kèm một hình ảnh chứa nội dung sau: ${desc}]`;
          }
        } catch (visionError) {
          console.error('Vision processing error:', visionError);
          finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng có đính kèm ảnh nhưng gặp lỗi khi phân tích.]`;
        }
      }

      // Save user message
      await this.chatService.saveMessage(familyId, 'user', finalUserMessage, sessionId);

      // Build user profiles for the prompt context
      const allUsers = await this.prisma.user.findMany({ where: { familyId } });
      const familyInfo = allUsers
        .map(
          (u) =>
            `- ${u.name} (Vai trò: ${u.role || 'Chưa rõ'}, Ngày sinh dương lịch: ${
              u.birthday ? u.birthday.toISOString().split('T')[0] : 'Chưa cập nhật'
            })`
        )
        .join('\n');

      // Get chat history
      const history = await this.chatService.getHistory(familyId, sessionId, 10);
      const messages: any[] = [
        { role: 'system', content: this.getSystemPrompt(familyInfo) },
        ...history.reverse().map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      ];

      messages.push({
        role: 'user',
        content: finalUserMessage,
      });

      // Call LLM with tools
      let response = await this.openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: this.getTools() as any,
        tool_choice: 'auto',
      });

      let assistantContent = '';
      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls || [];
      console.log('AI Stream Tool Calls:', toolCalls.length > 0 ? toolCalls.map(dc => dc.function.name) : 'NONE');

      if (toolCalls.length > 0) {
        messages.push(choice.message);

        for (const toolCall of toolCalls) {
          const result = await this.executeTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            familyId,
            userIds,
          );
          console.log(`Tool Result (${toolCall.function.name}):`, result);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Stream the final response
      const stream = await this.openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          assistantContent += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();

      // Save assistant response
      await this.chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);

    } catch (error) {
      console.error('AI Agent Stream Error:', error);
      res.write(`data: ${JSON.stringify({ content: 'Xin lỗi, tôi gặp chút lỗi kỹ thuật. Hãy thử lại sau nhé!' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  private async executeTool(
    toolName: string,
    args: any,
    familyId: string,
    userIds: string[] = [],
  ): Promise<any> {
    switch (toolName) {
      case 'generateFamilyMenu':
        return await this.mealsService.generateFamilyMenu(familyId);

      case 'getGoldPrice':
        return await this.getGoldPrice();

      case 'getEventsByMonth':
        return await this.eventsService.getEventsByMonth(
          args.familyId || familyId,
          args.month,
          args.year,
        );

      case 'createEvent': {
        // Find a valid user in the family, or create a default one
        let user = await this.prisma.user.findFirst({
          where: { familyId },
        });

        if (!user) {
          // Ensure the family exists first
          let family = await this.prisma.family.findUnique({ where: { id: familyId } });
          family ??= await this.prisma.family.create({
              data: { id: familyId, name: 'My Family' },
            });
          user = await this.prisma.user.create({
            data: {
              name: 'Family Member',
              email: `member@${familyId}.local`,
              role: 'Thành viên',
              familyId,
            },
          });
        }

        const event = await this.eventsService.create(familyId, user.id, {
          title: args.title,
          description: args.description,
          date: new Date(args.date),
          type: args.type || 'GENERAL',
        });
        return { success: true, event };
      }

      case 'updateEvent': {
        const result = await this.eventsService.update(args.id, familyId, {
          title: args.title,
          description: args.description,
          date: args.date ? new Date(args.date) : undefined,
          type: args.type,
        });
        return { success: true, result };
      }

      case 'deleteEvent': {
        const result = await this.eventsService.delete(args.id, familyId);
        return { success: true, result };
      }

      case 'getSolarDateFromLunar': {
        const date = getSolarDateFromLunar(args.day, args.month, args.year);
        if (!date) return { error: 'Không tìm thấy' };
        
        // Use local date formatting to avoid timezone shifts
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const solarDate = `${yyyy}-${mm}-${dd}`;
        
        return { 
          solarDate,
          formatted: date.toLocaleDateString('vi-VN'),
        };
      }

      default:
        return { error: 'Unknown tool' };
    }
  }

  private async getGoldPrice(): Promise<any> {
    try {
      const axios = await import('axios');
      const https = await import('node:https');

      const response = await axios.default.get(
        'https://giavang.now/api/prices',
        {
          timeout: 10000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
      );
      console.log('Gold API Status:', response.status);

      if (response.data?.success && response.data?.prices) {
        const prices = response.data.prices;
        const formatVND = (v: number) =>
          new Intl.NumberFormat('vi-VN').format(v);

        const sjc = prices.SJL1L10;
        const xau = prices.XAUUSD;
        const ring = prices.SJ9999;

        return {
          sjc_buy: sjc ? `${formatVND(sjc.buy)} VND/lượng` : 'N/A',
          sjc_sell: sjc ? `${formatVND(sjc.sell)} VND/lượng` : 'N/A',
          sjc_change: sjc ? `${sjc.change_buy >= 0 ? '+' : ''}${formatVND(sjc.change_buy)} VND` : 'N/A',
          nhan_sjc_buy: ring ? `${formatVND(ring.buy)} VND/lượng` : 'N/A',
          nhan_sjc_sell: ring ? `${formatVND(ring.sell)} VND/lượng` : 'N/A',
          world_gold_usd: xau ? `${xau.buy} USD/oz` : 'N/A',
          source: 'giavang.now (cập nhật mỗi 5 phút)',
          date: new Date().toISOString(),
        };
      }

      return { error: true, message: 'Không thể lấy được dữ liệu từ máy chủ giá vàng.' };
    } catch (error: any) {
      console.error('Gold Price Fetch Error:', error.message);
      return {
        error: true,
        message: 'Không thể kết nối với máy chủ giá vàng. Vui lòng kiểm tra tại sjc.com.vn hoặc giavang.doji.vn',
      };
    }
  }
}
