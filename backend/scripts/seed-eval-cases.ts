import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// expectedTool conventions:
// - a tool name string: the model MUST call exactly this tool
// - '' (empty string, distinct from null): the model MUST NOT call any tool
type SeedCase = {
  input: string;
  expectedSkill: string;
  expectedTool: string;
};

const cases: SeedCase[] = [
  // CalendarSkill
  { input: 'Tuần này gia đình có lịch gì không?', expectedSkill: 'CalendarSkill', expectedTool: 'getEventsByMonth' },
  { input: 'Đặt lịch họp phụ huynh cho con vào 15h thứ 6 tuần sau', expectedSkill: 'CalendarSkill', expectedTool: 'createEvent' },
  { input: 'Đổi giờ họp gia đình hôm nay sang 8 giờ tối', expectedSkill: 'CalendarSkill', expectedTool: 'updateEvent' },

  // FamilyKnowledgeSkill
  { input: 'Bố thích ăn gì nhỉ, mình quên mất rồi', expectedSkill: 'FamilyKnowledgeSkill', expectedTool: 'searchFamilyNotes' },
  { input: 'Nhớ giúp mình là con bị dị ứng tôm nhé', expectedSkill: 'FamilyKnowledgeSkill', expectedTool: 'createWikiEntry' },
  { input: 'Mẹ thích hoa hồng lắm', expectedSkill: 'FamilyKnowledgeSkill', expectedTool: 'autoSaveFamilyMemory' },

  // MealSkill
  { input: 'Hôm nay ăn gì đây ta', expectedSkill: 'MealSkill', expectedTool: 'generateFamilyMenu' },
  { input: 'Gợi ý thực đơn cho bữa tối nay đi', expectedSkill: 'MealSkill', expectedTool: 'generateFamilyMenu' },

  // MarketSkill
  { input: 'Giá vàng hôm nay bao nhiêu rồi', expectedSkill: 'MarketSkill', expectedTool: 'getGoldPrice' },
  { input: 'SJC với DOJI giá nhiêu vậy', expectedSkill: 'MarketSkill', expectedTool: 'getGoldPrice' },

  // SearchSkill
  { input: 'Thời sự hôm nay có tin gì mới không', expectedSkill: 'SearchSkill', expectedTool: 'search' },
  { input: 'Tìm giúp mình thông tin về vaccine cúm mùa này', expectedSkill: 'SearchSkill', expectedTool: 'search' },

  // WeatherSkill
  { input: 'Thời tiết Hà Nội hôm nay thế nào', expectedSkill: 'WeatherSkill', expectedTool: 'getWeather' },
  { input: 'Mai có mưa không nhỉ', expectedSkill: 'WeatherSkill', expectedTool: 'getWeather' },

  // FootballSkill
  { input: 'Đội tuyển Việt Nam đá khi nào vậy', expectedSkill: 'FootballSkill', expectedTool: 'get_matches' },
  { input: 'Kết quả trận MU tối qua thế nào rồi', expectedSkill: 'FootballSkill', expectedTool: 'get_matches' },

  // HoroscopeSkill — no tools at all, always a pure persona reply
  { input: 'Hôm nay vận may của mình thế nào', expectedSkill: 'HoroscopeSkill', expectedTool: '' },
  { input: 'Giờ nào tốt để xuất hành hôm nay', expectedSkill: 'HoroscopeSkill', expectedTool: '' },

  // GeneralChatSkill
  { input: 'Chào buổi sáng nha', expectedSkill: 'GeneralChatSkill', expectedTool: '' },
  { input: 'Mình thích ăn phở bò tái, ít hành', expectedSkill: 'GeneralChatSkill', expectedTool: 'updateAiMemory' },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  let created = 0;
  let skipped = 0;

  try {
    for (const testCase of cases) {
      const existing = await prisma.aiEvalCase.findFirst({ where: { input: testCase.input } });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.aiEvalCase.create({
        data: {
          input: testCase.input,
          expectedSkill: testCase.expectedSkill,
          expectedTool: testCase.expectedTool,
          status: 'ACTIVE',
        },
      });
      created++;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Seeded eval cases: ${created} created, ${skipped} skipped (already existed).`);
}

main().catch((err) => {
  console.error('Failed to seed eval cases:', err);
  process.exit(1);
});
