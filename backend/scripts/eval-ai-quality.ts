import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { classifyAiIntent } from '../src/modules/ai-agent/ai-intent-router';
import { parseCalendarMutation } from '../src/modules/ai-agent/ai-calendar-mutation-parser';

const prisma = new PrismaClient();

function getExpectedRuntimeTarget(actual: ReturnType<typeof classifyAiIntent>) {
  const skillByIntent: Record<string, string> = {
    image_vision: 'VisionSkill',
    gold_price: 'MarketSkill',
    horoscope: 'HoroscopeSkill',
    calendar_query: 'CalendarSkill',
    event_mutation: 'CalendarSkill',
    football: 'FootballSkill',
    weather: 'WeatherSkill',
    family_knowledge: 'FamilyKnowledgeSkill',
    meal_suggestion: 'MealSkill',
    web_search: 'SearchSkill',
    general_chat: 'GeneralChatSkill',
  };
  const toolByIntent: Record<string, string> = {
    gold_price: 'getGoldPrice',
    calendar_query: 'getEventsByMonth',
    event_mutation: 'createEvent',
    football: 'get_matches',
    meal_suggestion: 'generateFamilyMenu',
    web_search: 'search',
  };

  return {
    skill: skillByIntent[actual.intent],
    tool: toolByIntent[actual.intent],
  };
}

async function run() {
  console.log('Fetching active evaluation cases from database...');
  let cases: any[] = [];
  try {
    cases = await prisma.aiEvalCase.findMany({
      where: { status: 'ACTIVE' },
    });
  } catch (err: any) {
    console.error('Failed to query evaluation cases from database:', err.message);
    process.exit(1);
  }

  if (cases.length === 0) {
    console.log('No active evaluation cases found. Add some from the admin dashboard first!');
    return;
  }

  console.log(`Running evaluation on ${cases.length} cases...`);

  let passCount = 0;
  let failCount = 0;

  for (const testCase of cases) {
    console.log(`\nCase [${testCase.id}] Input: "${testCase.input}"`);
    const actualIntent = classifyAiIntent(testCase.input, false);
    const runtime = getExpectedRuntimeTarget(actualIntent);
    
    const errors: string[] = [];

    if (testCase.expectedIntent && actualIntent.intent !== testCase.expectedIntent) {
      errors.push(`Intent mismatch: expected "${testCase.expectedIntent}", got "${actualIntent.intent}"`);
    }

    if (testCase.expectedSkill && runtime.skill !== testCase.expectedSkill) {
      errors.push(`Skill mismatch: expected "${testCase.expectedSkill}", got "${runtime.skill}"`);
    }

    if (testCase.expectedTool && runtime.tool !== testCase.expectedTool) {
      errors.push(`Tool mismatch: expected "${testCase.expectedTool}", got "${runtime.tool}"`);
    }

    if (errors.length === 0) {
      console.log(' -> PASS');
      passCount++;
    } else {
      console.log(' -> FAIL');
      for (const err of errors) {
        console.log(`    - ${err}`);
      }
      failCount++;
    }
  }

  console.log('\n======================================');
  console.log(`PASS ${passCount}`);
  console.log(`FAIL ${failCount}`);
  console.log('======================================');

  await prisma.$disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Evaluation runner failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
