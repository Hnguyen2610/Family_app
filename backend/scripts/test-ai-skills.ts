import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiAgentService } from '../src/modules/ai-agent/services/ai-agent.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiAgentService);

  const testScenarios = [
    { name: 'Market Skill', query: 'Giá vàng hôm nay thế nào?' },
    { name: 'Meal Skill', query: 'Tối nay ăn gì ngon?' },
    { name: 'Calendar Skill', query: 'Tháng này có sự kiện gì không?' },
    { name: 'Horoscope Skill', query: 'Xem tử vi tuần này cho mình' },
    { name: 'General Chat', query: 'Chào bạn, bạn có thể giúp gì cho gia đình tôi?' },
  ];

  console.log('\n🚀 STARTING AI SKILLS SYSTEM TEST\n');

  for (const scenario of testScenarios) {
    console.log(`${'─'.repeat(50)}`);
    console.log(`📝 TEST: ${scenario.name}`);
    console.log(`❓ "${scenario.query}"`);
    try {
      const result = await aiService.chat('test-family-id', scenario.query, ['test-user-id'], undefined, 'gemini');
      console.log(`✅ RESPONSE:\n${result.content}`);
      console.log(result.direct ? `⚡ [DIRECT - No LLM]` : `🤖 [LLM Generated]`);
    } catch (error: any) {
      console.error(`❌ ERROR: ${error.message}`);
    }
    console.log('');
  }

  await app.close();
}

bootstrap();
