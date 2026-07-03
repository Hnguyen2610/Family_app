import { normalizeSearchText } from '../ai-agent/ai-intent-router';
import type { WeatherHeaderSummary } from '../weather/weather.service';

export function formatTelegramWeather(weather: WeatherHeaderSummary) {
  if (!weather.available || !weather.current) {
    return `Chưa lấy được thời tiết cho ${weather.location}.`;
  }

  const lines = [
    `Thời tiết ${weather.location}`,
    `Hiện tại: ${Math.round(weather.current.tempC)}°C, ${weather.current.condition}`,
    `Cảm giác như: ${Math.round(weather.current.feelsLikeC)}°C`,
    `Độ ẩm: ${Math.round(weather.current.humidity)}%`,
  ];

  if (weather.tomorrow) {
    lines.push(
      `Ngày mai: ${Math.round(weather.tomorrow.minTempC)}-${Math.round(weather.tomorrow.maxTempC)}°C, ${weather.tomorrow.condition}, mưa ${Math.round(weather.tomorrow.chanceOfRain)}%`,
    );
  }

  return lines.join('\n');
}

export function buildFootballWebSearchQuery(userText = '') {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayText = today.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const tomorrowText = tomorrow.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const scope = userText ? `${userText} ` : 'các giải đấu hàng đầu ';
  return `web search: lịch thi đấu bóng đá ${scope} ngày ${todayText} và rạng sáng ${tomorrowText} theo gio Viet Nam. Chỉ lấy lịch thi đấu, không lấy nhận định soi kèo,video kết quả. Giải, giờ, hai đội.`;
}

export function sanitizeTelegramReply(
  content: string,
  prompt = '',
  options: { hideSources?: boolean } = {},
) {
  const normalized = normalizeSearchText(`${prompt} ${content}`);
  if (normalized.includes('lich thi dau bong da') || normalized.includes('football')) {
    return sanitizeTelegramFootballReply(content);
  }

  let text = String(content || '')
    .replace(/<function=[\s\S]*?<\/function>/gi, '')
    .replace(/\b[a-zA-Z_][\w.]*\(\{[\s\S]*?\}\)/g, '')
    .trim();

  if (options.hideSources) {
    text = stripTelegramSources(text);
  }

  return text || content;
}

export function stripTelegramSources(content: string) {
  const lines = String(content || '').split(/\r?\n/);
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const normalized = normalizeSearchText(trimmed);
    if (normalized === 'nguon:' || normalized === 'source:' || normalized.startsWith('nguon ')) break;
    if (/https?:\/\//i.test(trimmed)) continue;
    if (/^\d+\.\s+.*https?:\/\//i.test(trimmed)) continue;
    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

export function sanitizeTelegramFootballReply(content: string) {
  const lines = String(content || '').split(/\r?\n/);
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const normalized = normalizeSearchText(trimmed);
    if (!trimmed) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('');
      continue;
    }
    if (normalized === 'nguon:' || normalized === 'source:' || normalized.startsWith('nguồn ')) break;
    if (/https?:\/\//i.test(trimmed)) continue;
    if (/^\d+\.\s+.*https?:\/\//i.test(trimmed)) continue;
    cleaned.push(trimmed);
  }

  return cleaned.join('\n').trim() || content;
}

export function isFootballNoDataResponse(content: string) {
  const text = normalizeSearchText(content || '');
  return [
    'không có trận nào',
    'không lấy được lịch bóng đá',
    'api giới hạn',
    'api key missing',
  ].some((pattern) => text.includes(pattern));
}
