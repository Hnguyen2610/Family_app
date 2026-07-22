import { Injectable, Logger } from '@nestjs/common';
import { normalizeSearchText } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { WeatherHeaderSummary, WeatherService } from '../../weather/weather.service';

@Injectable()
export class WeatherSkill implements AiSkill {
  name = 'WeatherSkill';
  private readonly logger = new Logger(WeatherSkill.name);

  constructor(private readonly weatherService: WeatherService) {}

  getSystemPrompt(_context: AiSkillContext): string {
    return [
      'WEATHER RULES:',
      '- Answer in Vietnamese, prefer Celsius, humidity, wind, and rain chance.',
      '- Respond conversationally based on the tool result, mentioning the location clearly.',
    ].join('\n');
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'getWeather',
          description: 'Get real-time weather forecast for a location. Always call this for any weather-related question — never answer from memory or assumptions, weather data changes constantly.',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'City name in English (e.g. "Ha Noi", "Da Nang"). Omit to use the family home location.',
              },
            },
            required: [],
          },
        },
      },
    ];
  }

  // LLM-first: always let the LLM call getWeather tool
  async tryDirectAnswer(_context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    return undefined;
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    if (toolName !== 'getWeather') return { error: 'Unknown tool' };

    const location = args?.location?.trim() || undefined;
    try {
      const weather = await this.weatherService.getHeaderSummary(location);
      if (!weather.available || !weather.current) {
        return { error: 'Weather data unavailable', fallback: this.buildFallback(location) };
      }
      const wantsTomorrow = this.isTomorrowQuestion(context.userMessage);
      return { success: true, data: this.formatWeatherAnswer(weather, wantsTomorrow) };
    } catch (err: any) {
      this.logger.error(`WeatherSkill.executeTool error: ${err?.message}`);
      return { error: err?.message, fallback: this.buildFallback(location) };
    }
  }

  private buildFallback(location?: string): string {
    return `Không lấy được thông tin thời tiết${location ? ` cho ${location}` : ''} lúc này. Bạn thử lại sau nhé.`;
  }

  private isTomorrowQuestion(message: string): boolean {
    const normalized = normalizeSearchText(message || '');
    return normalized.includes('ngay mai') || normalized.includes('tomorrow');
  }

  private formatWeatherAnswer(weather: WeatherHeaderSummary, wantsTomorrow: boolean): string {
    if (!weather.available || !weather.current) {
      return this.buildFallback(weather.location);
    }

    if (wantsTomorrow && weather.tomorrow) {
      return [
        `Dự báo ngày mai ở ${weather.location}: ${weather.tomorrow.condition.toLowerCase()}.`,
        `Nhiệt độ khoảng ${Math.round(weather.tomorrow.minTempC)}–${Math.round(weather.tomorrow.maxTempC)}°C.`,
        `Khả năng mưa ${weather.tomorrow.chanceOfRain}%, lượng mưa khoảng ${weather.tomorrow.totalPrecipMm}mm.`,
      ].join('\n');
    }

    const current = weather.current;
    const lines = [
      `Thời tiết hiện tại ở ${weather.location}: ${current.condition.toLowerCase()}.`,
      `Nhiệt độ ${Math.round(current.tempC)}°C, cảm giác như ${Math.round(current.feelsLikeC)}°C.`,
      `Độ ẩm ${current.humidity}%, gió khoảng ${Math.round(current.windKph)} km/h.`,
    ];

    if (weather.tomorrow) {
      lines.push(
        `Ngày mai: ${weather.tomorrow.condition.toLowerCase()}, khả năng mưa ${weather.tomorrow.chanceOfRain}%, ${Math.round(weather.tomorrow.minTempC)}–${Math.round(weather.tomorrow.maxTempC)}°C.`,
      );
    }

    return lines.join('\n');
  }
}
