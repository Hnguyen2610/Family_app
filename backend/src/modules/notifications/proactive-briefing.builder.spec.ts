import { ProactiveBriefingBuilder } from './proactive-briefing.builder';

describe('ProactiveBriefingBuilder', () => {
  let builder: ProactiveBriefingBuilder;
  let mockPrisma: any;
  let mockEventsService: any;
  let mockFinanceService: any;
  let mockAiAgentService: any;

  beforeEach(() => {
    mockPrisma = {};
    mockEventsService = {};
    mockFinanceService = {};
    mockAiAgentService = {
      generateBriefingText: jest.fn(),
    };

    builder = new ProactiveBriefingBuilder(
      mockPrisma,
      mockEventsService,
      mockFinanceService,
      mockAiAgentService,
    );
  });

  const testItems = [
    {
      kind: 'event' as const,
      title: 'Sinh nhật bé Tin',
      message: 'Hôm nay: Sinh nhật bé Tin.',
      path: '/calendar',
      reason: 'event_today',
    },
    {
      kind: 'weather' as const,
      title: 'Thời tiết Hà Nội',
      message: 'Hôm nay mưa to dông bão.',
      path: '/calendar',
      reason: 'rain_or_bad_weather_today',
    },
  ];

  it('formats daily briefing using AI when generateBriefingText succeeds', async () => {
    const aiBriefingText = 'Chào cả nhà, hôm nay là một ngày đặc biệt với sinh nhật bé Tin! Hãy nhớ mang theo ô vì trời dự báo mưa dông sấm chớp đấy nhé.';
    mockAiAgentService.generateBriefingText.mockResolvedValue(aiBriefingText);

    const result = await builder.formatDailyBriefingMessage(testItems);

    expect(result).toBe(aiBriefingText);
    expect(mockAiAgentService.generateBriefingText).toHaveBeenCalledWith(
      expect.stringContaining('Bạn là Trợ lý Gia đình AI'),
      expect.stringContaining('Sinh nhật bé Tin')
    );
  });

  it('falls back to local template rendering when AI service throws an error', async () => {
    mockAiAgentService.generateBriefingText.mockRejectedValue(new Error('API Timeout'));

    const result = await builder.formatDailyBriefingMessage(testItems);

    expect(result).toContain('Hôm nay có vài điểm đáng chú ý:');
    expect(result).toContain('- Lịch: Hôm nay: Sinh nhật bé Tin.');
    expect(result).toContain('- Thời tiết: Hôm nay mưa to dông bão.');
  });

  it('falls back to local template rendering when AI returns an empty or invalid short response', async () => {
    mockAiAgentService.generateBriefingText.mockResolvedValue('Short.');

    const result = await builder.formatDailyBriefingMessage(testItems);

    expect(result).toContain('Hôm nay có vài điểm đáng chú ý:');
    expect(result).toContain('- Lịch: Hôm nay: Sinh nhật bé Tin.');
  });

  describe('buildWeatherBriefingItem', () => {
    const rainyForecast = {
      location: 'Ha Noi',
      date: '2026-07-24',
      condition: 'Mưa rào nhẹ',
      chanceOfRain: 80,
      totalPrecipMm: 5,
      maxTempC: 33,
      minTempC: 26,
    };
    const clearForecast = {
      location: 'Ha Noi',
      date: '2026-07-23',
      condition: 'Có mây rải rác',
      chanceOfRain: 10,
      totalPrecipMm: 0,
      maxTempC: 39,
      minTempC: 28,
    };

    it('uses today forecast and "Hôm nay" wording when today is rainy', () => {
      const item = (builder as any).buildWeatherBriefingItem(rainyForecast, clearForecast);

      expect(item.reason).toBe('rain_or_bad_weather_today');
      expect(item.message).toContain('Hôm nay');
      expect(item.metadata.forecastFor).toBe('today');
    });

    it('falls back to tomorrow forecast and "Ngày mai" wording when today is clear but tomorrow is rainy', () => {
      const item = (builder as any).buildWeatherBriefingItem(clearForecast, rainyForecast);

      expect(item.reason).toBe('rain_or_bad_weather_tomorrow');
      expect(item.message).toContain('Ngày mai');
      expect(item.metadata.forecastFor).toBe('tomorrow');
    });

    it('returns null when neither today nor tomorrow is rainy', () => {
      const item = (builder as any).buildWeatherBriefingItem(clearForecast, clearForecast);

      expect(item).toBeNull();
    });

    it('returns null when both forecasts are unavailable', () => {
      const item = (builder as any).buildWeatherBriefingItem(null, null);

      expect(item).toBeNull();
    });
  });
});
