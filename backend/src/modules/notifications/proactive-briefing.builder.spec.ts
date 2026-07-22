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
});
