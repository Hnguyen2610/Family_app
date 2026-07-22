import { Injectable, Logger } from '@nestjs/common';

export type WeatherForecastSummary = {
  location: string;
  date: string;
  condition: string;
  chanceOfRain: number;
  totalPrecipMm: number;
  maxTempC: number;
  minTempC: number;
};

export type WeatherHeaderSummary = {
  available: boolean;
  provider: string;
  location: string;
  current?: {
    tempC: number;
    feelsLikeC: number;
    condition: string;
    humidity: number;
    windKph: number;
    icon?: string;
    updatedAt?: string;
  };
  today?: WeatherForecastSummary;
  tomorrow?: WeatherForecastSummary;
};

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cacheTtlMs = 3 * 60 * 60 * 1000;
  private cache = new Map<string, { expiresAt: number; data: WeatherHeaderSummary }>();

  async getHeaderSummary(locationOverride?: string): Promise<WeatherHeaderSummary> {
    const provider = (process.env.WEATHER_PROVIDER || '').toLowerCase();
    const location = (locationOverride || process.env.WEATHER_LOCATION || 'Ha Noi').trim();
    const cacheKey = `${provider || 'none'}:${location.toLowerCase()}`;

    if (provider !== 'weatherapi' || !process.env.WEATHERAPI_KEY) {
      return { available: false, provider: provider || 'none', location };
    }

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await this.fetchWeatherApiForecast(location);
    this.cache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return data;
  }

  async getTodayForecast(): Promise<WeatherForecastSummary | null> {
    const summary = await this.getHeaderSummary();
    return summary.available ? summary.today || null : null;
  }

  async getTomorrowForecast(): Promise<WeatherForecastSummary | null> {
    const summary = await this.getHeaderSummary();
    return summary.available ? summary.tomorrow || null : null;
  }

  private async fetchWeatherApiForecast(location: string): Promise<WeatherHeaderSummary> {
    try {
      const apiKey = process.env.WEATHERAPI_KEY || '';
      const url = [
        'https://api.weatherapi.com/v1/forecast.json',
        `?key=${encodeURIComponent(apiKey)}`,
        `&q=${encodeURIComponent(location)}`,
        '&days=2&aqi=no&alerts=no&lang=vi',
      ].join('');

      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`WeatherAPI forecast failed: ${response.status}`);
        return { available: false, provider: 'weatherapi', location };
      }

      const data: any = await response.json();
      const todayForecastDay = data?.forecast?.forecastday?.[0];
      const tomorrowForecastDay = data?.forecast?.forecastday?.[1];
      const todayDay = todayForecastDay?.day;
      const tomorrowDay = tomorrowForecastDay?.day;
      const current = data?.current;

      return {
        available: true,
        provider: 'weatherapi',
        location: data?.location?.name || location,
        current: current
          ? {
              tempC: Number(current.temp_c || 0),
              feelsLikeC: Number(current.feelslike_c || 0),
              condition: current.condition?.text || 'Thời tiết thay đổi',
              humidity: Number(current.humidity || 0),
              windKph: Number(current.wind_kph || 0),
              icon: current.condition?.icon,
              updatedAt: current.last_updated,
            }
          : undefined,
        today: todayForecastDay && todayDay
          ? {
              location: data?.location?.name || location,
              date: todayForecastDay.date,
              condition: todayDay.condition?.text || 'Thời tiết thay đổi',
              chanceOfRain: Number(todayDay.daily_chance_of_rain || 0),
              totalPrecipMm: Number(todayDay.totalprecip_mm || 0),
              maxTempC: Number(todayDay.maxtemp_c || 0),
              minTempC: Number(todayDay.mintemp_c || 0),
            }
          : undefined,
        tomorrow: tomorrowForecastDay && tomorrowDay
          ? {
              location: data?.location?.name || location,
              date: tomorrowForecastDay.date,
              condition: tomorrowDay.condition?.text || 'Thời tiết thay đổi',
              chanceOfRain: Number(tomorrowDay.daily_chance_of_rain || 0),
              totalPrecipMm: Number(tomorrowDay.totalprecip_mm || 0),
              maxTempC: Number(tomorrowDay.maxtemp_c || 0),
              minTempC: Number(tomorrowDay.mintemp_c || 0),
            }
          : undefined,
      };
    } catch (error) {
      this.logger.warn(`Weather forecast skipped: ${(error as Error)?.message || error}`);
      return { available: false, provider: 'weatherapi', location };
    }
  }
}
