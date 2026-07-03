import { Injectable } from '@nestjs/common';
import { AiIntent, normalizeSearchText } from '../ai-intent-router';
import { AiSkill, AiSkillContext, AiSkillResponse } from '../interfaces/ai-skill.interface';
import { WeatherHeaderSummary, WeatherService } from '../../weather/weather.service';

@Injectable()
export class WeatherSkill implements AiSkill {
  name = 'WeatherSkill';

  constructor(private readonly weatherService: WeatherService) {}

  canHandle(intent: AiIntent): boolean {
    return intent === 'weather';
  }

  getSystemPrompt(_context: AiSkillContext): string {
    return [
      'WEATHER RULES:',
      '- Answer weather questions in Vietnamese.',
      '- Prefer Celsius, humidity, wind, and rain chance.',
      '- Do not use web search when WeatherAPI data is available.',
    ].join('\n');
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    const location = this.extractLocation(context.userMessage);
    const weather = await this.weatherService.getHeaderSummary(location);

    return {
      content: this.formatWeatherAnswer(weather, this.isTomorrowQuestion(context.userMessage)),
      direct: true,
    };
  }

  private extractLocation(message: string) {
    const original = (message || '').trim().replace(/[?.!]+$/g, '');
    const explicit = original.match(/(?:\bo\b|\u1edf|\btai\b|t\u1ea1i|cho)\s+(.+)$/i)?.[1]?.trim();
    if (explicit) {
      const location = this.cleanLocation(explicit);
      if (location) return location;
    }

    const normalized = normalizeSearchText(original);
    const knownLocations: Array<[string, string]> = [
      ['ha noi', 'Ha Noi'],
      ['hanoi', 'Ha Noi'],
      ['ho chi minh', 'Ho Chi Minh'],
      ['sai gon', 'Ho Chi Minh'],
      ['da nang', 'Da Nang'],
      ['hai phong', 'Hai Phong'],
      ['nha trang', 'Nha Trang'],
      ['da lat', 'Da Lat'],
      ['can tho', 'Can Tho'],
    ];

    return knownLocations.find(([key]) => normalized.includes(key))?.[1];
  }

  private cleanLocation(value: string) {
    return value
      .replace(/\b(hom nay|h\u00f4m nay|ngay mai|ng\u00e0y mai|cuoi tuan|cu\u1ed1i tu\u1ea7n|nhu the nao|nh\u01b0 th\u1ebf n\u00e0o|co mua khong|c\u00f3 m\u01b0a kh\u00f4ng)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isTomorrowQuestion(message: string) {
    const normalized = normalizeSearchText(message || '');
    return normalized.includes('ngay mai') || normalized.includes('tomorrow');
  }

  private formatWeatherAnswer(weather: WeatherHeaderSummary, wantsTomorrow: boolean) {
    if (!weather.available || !weather.current) {
      return 'Mình chưa lấy được dữ liệu thời tiết lúc này. Bạn kiểm tra lại cấu hình WeatherAPI hoặc thử lại sau nhé.';
    }

    if (wantsTomorrow && weather.tomorrow) {
      return [
        `Dự báo ngày mai ở ${weather.location}: ${weather.tomorrow.condition.toLowerCase()}.`,
        `Nhiệt độ khoảng ${Math.round(weather.tomorrow.minTempC)}-${Math.round(weather.tomorrow.maxTempC)}°C.`,
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
      lines.push(`Ngày mai: ${weather.tomorrow.condition.toLowerCase()}, khả năng mưa ${weather.tomorrow.chanceOfRain}%, ${Math.round(weather.tomorrow.minTempC)}-${Math.round(weather.tomorrow.maxTempC)}°C.`);
    }

    return lines.join('\n');
  }
}
