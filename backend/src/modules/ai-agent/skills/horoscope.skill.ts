import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiSkill, AiSkillContext, AiSkillTool } from '../interfaces/ai-skill.interface';
import { HoroscopeService } from '../services/horoscope.service';

@Injectable()
export class HoroscopeSkill implements AiSkill {
  name = 'HoroscopeSkill';
  private readonly logger = new Logger(HoroscopeSkill.name);

  constructor(
    private readonly horoscopeService: HoroscopeService,
    private readonly prisma: PrismaService,
  ) {}

  getSystemPrompt(_context: AiSkillContext): string {
    return `HOROSCOPE PERSONA:\n- ALWAYS call the getHoroscope tool for any horoscope/tử vi/chiêm tinh question about the user — never answer from memory, the tool generates a fresh, grounded reading using the user's real birthdate.\n- Relay the tool's returned text as the answer; it is already personalized and appropriately concise, do not force it into extra sections.\n- If the tool result says birthday is missing, ask the user to update their birthday in the app before giving a personalized horoscope — do not make one up.\n- Do not create calendar events unless the user explicitly asks.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'getHoroscope',
          description: 'Generate a personalized horoscope/tử vi reading for the current linked user, grounded in their real birthdate (lunar year, Can-Chi, zodiac animal, and five-element mệnh are computed exactly, not guessed). Always call this for any horoscope, tử vi, or chiêm tinh question — never answer from memory.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
    ];
  }

  async executeTool(toolName: string, _args: any, context: AiSkillContext): Promise<any> {
    if (toolName !== 'getHoroscope') return { error: 'Unknown tool' };

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: context.userId },
        select: { name: true, birthday: true },
      });

      if (!user) {
        return { error: 'User not found' };
      }

      if (!user.birthday) {
        return {
          success: true,
          data: 'Mình chưa có ngày sinh của bạn trong hồ sơ nên chưa thể xem tử vi cá nhân hóa được. Bạn cập nhật ngày sinh trong phần Thông tin cá nhân của app rồi hỏi lại mình nhé!',
        };
      }

      const reading = await this.horoscopeService.generateOnDemandHoroscope(
        user.name,
        user.birthday,
        context.userMessage,
      );
      return { success: true, data: reading };
    } catch (err: any) {
      this.logger.error(`HoroscopeSkill.executeTool error: ${err?.message}`);
      return { error: err?.message, fallback: 'Không xem được tử vi lúc này, bạn thử lại sau nhé.' };
    }
  }
}
