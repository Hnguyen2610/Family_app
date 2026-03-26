import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './chat.service';
import { MealsService } from '../../meals/meals.service';
import { EventsService } from '../../events/events.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { getSolarDateFromLunar } from '../../../utils/lunar-calendar.util';

@Injectable()
export class AiAgentService {
  private readonly openai: OpenAI;
  private readonly gemini: GoogleGenerativeAI;

  constructor(
    private readonly chatService: ChatService,
    private readonly mealsService: MealsService,
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
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
          description: 'Get all events for a specific month. Calls this to check the calendar.',
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
              userId: {
                type: 'string',
                description: 'User ID of the requester to see their private events (optional)',
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
              time: {
                type: 'string',
                description: 'Event time in HH:mm format (24h), e.g., "18:00"',
              },
              scope: {
                type: 'string',
                enum: ['PRIVATE', 'FAMILY', 'GLOBAL'],
                description: 'Scope/Privacy of the event. Use PRIVATE for personal tasks, FAMILY for family events.',
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

  private getGeminiTools() {
    const tools = this.getTools();
    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as any,
      })),
    }];
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
5. updateEvent - Use this to update/change an event.
6. deleteEvent - Use this to remove an event.
7. getSolarDateFromLunar - Use this to convert Lunar to Solar date before setting event.

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

  private async getFamilyContext(familyId: string): Promise<string> {
    const allUsers = await this.prisma.user.findMany({ where: { familyId } });
    return allUsers
      .map(
        (u) =>
          `- ${u.name} (Vai trò: ${u.role || 'Chưa rõ'}, Ngày sinh dương lịch: ${
            u.birthday ? u.birthday.toISOString().split('T')[0] : 'Chưa cập nhật'
          })`
      )
      .join('\n');
  }

  private async processVisionImage(userMessage: string, image?: string): Promise<string> {
    let finalUserMessage = userMessage || '[Đã gửi hình ảnh]';
    if (!image) return finalUserMessage;

    try {
      const match = image.match(/^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const data = match[2];
        const model = this.gemini.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent([
          'Mô tả chi tiết và đọc bất kỳ văn bản/dữ liệu nào trong hình ảnh này bằng tiếng Việt.',
          { inlineData: { data, mimeType } }
        ]);
        const desc = result.response.text();
        if (desc) {
          finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng đã đính kèm một hình ảnh chứa nội dung sau: ${desc}]`;
        }
      } else {
         finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Định dạng ảnh đính kèm không hợp lệ.]`;
      }
    } catch (visionError: any) {
      console.error('Vision processing error:', visionError);
      const errMsg = visionError.message || visionError.toString();
      finalUserMessage = `${userMessage ? userMessage + '\n\n' : ''}[Hệ thống ghi chú: Người dùng có đính kèm ảnh nhưng gặp lỗi khi phân tích: ${errMsg}]`;
    }
    return finalUserMessage;
  }

  private async executeTool(
    toolName: string,
    args: any,
    familyId: string,
    userId: string,
    userIds: string[] = [],
  ): Promise<any> {
    try {
      console.log(`Executing tool: ${toolName}`, args);
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
            args.userId || userId,
          );
  
        case 'createEvent':
        case 'updateEvent':
        case 'deleteEvent': {
          if (toolName === 'createEvent') {
            // Combine date and time if provided
            let eventDate = new Date(args.date);
            if (args.time) {
              const [hours, minutes] = args.time.split(':').map(Number);
              if (!isNaN(hours) && !isNaN(minutes)) {
                eventDate.setHours(hours, minutes, 0, 0);
              }
            }

            const event = await this.eventsService.create(familyId, userId, {
              title: args.title,
              description: args.description,
              date: eventDate,
              time: args.time || '09:00',
              type: args.type || 'GENERAL',
              scope: args.scope || 'FAMILY',
            });
            return { success: true, event };
          } else if (toolName === 'updateEvent') {
            // Combine date and time if provided for update
            let eventDate = args.date ? new Date(args.date) : undefined;
            if (eventDate && args.time) {
              const [hours, minutes] = args.time.split(':').map(Number);
              if (!isNaN(hours) && !isNaN(minutes)) {
                eventDate.setHours(hours, minutes, 0, 0);
              }
            }

            const result = await this.eventsService.update(args.id, familyId, userId, {
              title: args.title,
              description: args.description,
              date: eventDate,
              time: args.time,
              type: args.type,
              scope: args.scope,
            });
            return { success: true, result };
          } else {
            const result = await this.eventsService.delete(args.id, familyId, userId);
            return { success: true, result };
          }
        }
  
        case 'getSolarDateFromLunar': {
          const date = getSolarDateFromLunar(args.day, args.month, args.year);
          if (!date) return { error: 'Không tìm thấy' };
          
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
    } catch (e: any) {
      console.error(`Tool execution error for ${toolName}:`, e);
      return { error: e.message || 'Error executing tool' };
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
      console.log('Gold API Response Timestamp:', response.data?.timestamp);

      if (response.data?.success && response.data?.prices) {
        const prices = response.data.prices;
        const formatVND = (v: number) =>
          new Intl.NumberFormat('vi-VN').format(v);

        const sjc = prices.SJL1L10;
        const xau = prices.XAUUSD;
        const ring = prices.SJ9999;
        const dojiHn = prices.DOHNL;
        const pnjHn = prices.PQHNVM;

        const summaryParts = [];
        if (sjc) summaryParts.push(`- Vàng SJC 9999: Mua ${formatVND(sjc.buy)} / Bán ${formatVND(sjc.sell)} VND/lượng (${sjc.change_buy >= 0 ? '+' : ''}${formatVND(sjc.change_buy)} VND)`);
        if (dojiHn) summaryParts.push(`- Vàng DOJI Hà Nội: Mua ${formatVND(dojiHn.buy)} / Bán ${formatVND(dojiHn.sell)} VND/lượng`);
        if (pnjHn) summaryParts.push(`- Vàng PNJ Hà Nội: Mua ${formatVND(pnjHn.buy)} / Bán ${formatVND(pnjHn.sell)} VND/lượng`);
        if (ring) summaryParts.push(`- Vàng nhẫn SJC: Mua ${formatVND(ring.buy)} / Bán ${formatVND(ring.sell)} VND/lượng`);
        if (xau) summaryParts.push(`- Vàng Thế giới (XAUUSD): ${xau.buy} USD/oz`);

        const result = {
          formatted_summary: summaryParts.join('\n'),
          sjc_buy: sjc ? `${formatVND(sjc.buy)} VND/lượng` : 'N/A',
          sjc_sell: sjc ? `${formatVND(sjc.sell)} VND/lượng` : 'N/A',
          sjc_change: sjc ? `${sjc.change_buy >= 0 ? '+' : ''}${formatVND(sjc.change_buy)} VND` : 'N/A',
          nhan_sjc_buy: ring ? `${formatVND(ring.buy)} VND/lượng` : 'N/A',
          nhan_sjc_sell: ring ? `${formatVND(ring.sell)} VND/lượng` : 'N/A',
          world_gold_usd: xau ? `${xau.buy} USD/oz` : 'N/A',
          source: 'giavang.now (cập nhật mới nhất từ API)',
          api_date: response.data.date,
          api_time: response.data.time,
          fetch_timestamp: new Date().toISOString(),
        };

        console.log('Final Gold Tool Result:', result);
        return result;
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

  // ==== HANDLERS ====

  private async handleGeminiChat(
    familyId: string,
    history: any[],
    familyInfo: string,
    finalUserMessage: string,
    userId: string,
    userIds: string[],
    sessionId?: string,
  ) {
    const genModel = this.gemini.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: this.getSystemPrompt(familyInfo),
      tools: this.getGeminiTools(),
    });
    const chat = genModel.startChat({
      history: [...history].reverse().map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    let currentInput: any = finalUserMessage;
    let assistantContent = '';
    let loopCount = 0;

    while (loopCount < 5) {
      const result = await chat.sendMessage(currentInput);
      const candidates = result.response.candidates;
      const part = candidates?.[0]?.content?.parts?.[0];

      if (part?.functionCall) {
        loopCount++;
        const res = await this.executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, userIds);
        currentInput = [{ functionResponse: { name: part.functionCall.name, response: res } }];
      } else {
        assistantContent = result.response.text();
        break;
      }
    }
    await this.chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
    return { content: assistantContent, familyId };
  }

  private async handleGroqChat(
    familyId: string,
    history: any[],
    familyInfo: string,
    finalUserMessage: string,
    userId: string,
    userIds: string[],
    sessionId?: string,
  ) {
    const messages = [
      { role: 'system', content: this.getSystemPrompt(familyInfo) },
      ...[...history].reverse().map((m) => ({ role: m.role as any, content: m.content })),
      { role: 'user', content: finalUserMessage },
    ];

    let response = await this.openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: this.getTools() as any,
    });

    let assistantContent = '';
    const toolCalls = response.choices[0].message.tool_calls;
    if (toolCalls) {
      messages.push(response.choices[0].message as any);
      for (const tc of toolCalls) {
        const res = await this.executeTool(tc.function.name, JSON.parse(tc.function.arguments), familyId, userId, userIds);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) } as any);
      }
      const final = await this.openai.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages });
      assistantContent = final.choices[0].message.content || '';
    } else {
      assistantContent = response.choices[0].message.content || '';
    }

    await this.chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
    return { content: assistantContent, familyId };
  }

  private async handleGeminiStream(
    familyId: string,
    history: any[],
    familyInfo: string,
    finalUserMessage: string,
    userId: string,
    userIds: string[],
    streamOptions: { res: any; sessionId?: string },
  ) {
    const { res, sessionId } = streamOptions;
    const genModel = this.gemini.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: this.getSystemPrompt(familyInfo),
      tools: this.getGeminiTools(),
    });
    const chat = genModel.startChat({
      history: [...history].reverse().map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    let currentInput: any = finalUserMessage;
    let assistantContent = '';
    let loopCount = 0;

    while (loopCount < 5) {
      const result = await chat.sendMessageStream(currentInput);
      let hasToolCall = false;
      for await (const chunk of result.stream) {
        const candidates = chunk.candidates;
        const part = candidates?.[0]?.content?.parts?.[0];
        if (part?.functionCall) {
          hasToolCall = true;
          loopCount++;
          const toolRes = await this.executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, userIds);
          currentInput = [{ functionResponse: { name: part.functionCall.name, response: toolRes } }];
          break;
        } else {
          const text = chunk.text();
          assistantContent += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
      if (!hasToolCall) break;
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
    if (assistantContent) await this.chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  }

  private async handleGroqStream(
    familyId: string,
    history: any[],
    familyInfo: string,
    finalUserMessage: string,
    userId: string,
    userIds: string[],
    streamOptions: { res: any; sessionId?: string },
  ) {
    const { res, sessionId } = streamOptions;
    const messages = [
      { role: 'system', content: this.getSystemPrompt(familyInfo) },
      ...[...history].reverse().map((m) => ({ role: m.role as any, content: m.content })),
      { role: 'user', content: finalUserMessage },
    ];

    const response = await this.openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: this.getTools() as any,
    });

    let assistantContent = '';
    const toolCalls = response.choices[0].message.tool_calls;
    if (toolCalls) {
      messages.push(response.choices[0].message as any);
      for (const tc of toolCalls) {
        const res = await this.executeTool(tc.function.name, JSON.parse(tc.function.arguments), familyId, userId, userIds);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) } as any);
      }
    }

    const stream = await this.openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        assistantContent += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
    await this.chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  }

  async chat(familyId: string, userMessage: string, userIds: string[] = [], image?: string, modelSelection?: string, sessionId?: string) {
    try {
      const finalUserMessage = await this.processVisionImage(userMessage, image);
      await this.chatService.saveMessage(familyId, 'user', finalUserMessage, sessionId);

      const familyInfo = await this.getFamilyContext(familyId);
      const history = await this.chatService.getHistory(familyId, sessionId, 10);

      if (modelSelection === 'gemini') {
        return await this.handleGeminiChat(familyId, history, familyInfo, finalUserMessage, userIds[0], userIds, sessionId);
      }

      return await this.handleGroqChat(familyId, history, familyInfo, finalUserMessage, userIds[0], userIds, sessionId);
    } catch (e: any) {
      console.error('Chat Error:', e);
      throw new HttpException('AI Error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async chatStream(familyId: string, userMessage: string, userIds: string[], res: any, sessionId?: string, image?: string, modelSelection?: string) {
    try {
      const finalUserMessage = await this.processVisionImage(userMessage, image);
      await this.chatService.saveMessage(familyId, 'user', finalUserMessage, sessionId);

      const familyInfo = await this.getFamilyContext(familyId);
      const history = await this.chatService.getHistory(familyId, sessionId, 10);

      if (modelSelection === 'gemini') {
        return await this.handleGeminiStream(familyId, history, familyInfo, finalUserMessage, userIds[0], userIds, { res, sessionId });
      }

      return await this.handleGroqStream(familyId, history, familyInfo, finalUserMessage, userIds[0], userIds, { res, sessionId });
    } catch (e: any) {
      console.error('Stream Error:', e);
      res.write(`data: ${JSON.stringify({ content: 'Lỗi AI.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
