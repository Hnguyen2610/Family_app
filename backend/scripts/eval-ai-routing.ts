import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { classifyAiIntent, type AiIntent } from '../src/modules/ai-agent/ai-intent-router';

type RoutingEvalCase = {
  id: string;
  group: string;
  input: string;
  hasImage?: boolean;
  expectedIntent: AiIntent;
  expectedSkill?: string;
  expectedTool?: string;
  expectedRequiresTools?: boolean;
  expectedReason?: string;
  expectedReasonPrefix?: string;
};

type EvalFailure = {
  testCase: RoutingEvalCase;
  actual: ReturnType<typeof classifyAiIntent>;
  errors: string[];
};

const filePath = join(process.cwd(), 'scripts', 'ai-routing-evals.json');
const cases = JSON.parse(readFileSync(filePath, 'utf8')) as RoutingEvalCase[];
const failures: EvalFailure[] = [];

function getExpectedRuntimeTarget(actual: ReturnType<typeof classifyAiIntent>) {
  if (actual.reason.startsWith('needs_intent_classifier:')) {
    return { skill: 'IntentClassifier', tool: undefined };
  }

  const skillByIntent: Partial<Record<AiIntent, string>> = {
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
  const toolByIntent: Partial<Record<AiIntent, string>> = {
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

for (const testCase of cases) {
  const actual = classifyAiIntent(testCase.input, Boolean(testCase.hasImage));
  const runtimeTarget = getExpectedRuntimeTarget(actual);
  const errors: string[] = [];

  if (actual.intent !== testCase.expectedIntent) {
    errors.push(`intent expected ${testCase.expectedIntent}, got ${actual.intent}`);
  }

  if (
    typeof testCase.expectedRequiresTools === 'boolean' &&
    actual.requiresTools !== testCase.expectedRequiresTools
  ) {
    errors.push(`requiresTools expected ${testCase.expectedRequiresTools}, got ${actual.requiresTools}`);
  }

  if (testCase.expectedSkill && runtimeTarget.skill !== testCase.expectedSkill) {
    errors.push(`skill expected ${testCase.expectedSkill}, got ${runtimeTarget.skill || 'none'}`);
  }

  if (testCase.expectedTool && runtimeTarget.tool !== testCase.expectedTool) {
    errors.push(`tool expected ${testCase.expectedTool}, got ${runtimeTarget.tool || 'none'}`);
  }

  if (testCase.expectedReason && actual.reason !== testCase.expectedReason) {
    errors.push(`reason expected ${testCase.expectedReason}, got ${actual.reason}`);
  }

  if (testCase.expectedReasonPrefix && !actual.reason.startsWith(testCase.expectedReasonPrefix)) {
    errors.push(`reason expected prefix ${testCase.expectedReasonPrefix}, got ${actual.reason}`);
  }

  if (errors.length > 0) {
    failures.push({ testCase, actual, errors });
  }
}

if (failures.length > 0) {
  const failureLogPath = join(process.cwd(), 'scripts', 'ai-routing-failures.generated.json');
  writeFileSync(
    failureLogPath,
    JSON.stringify(
      failures.map((failure) => ({
        id: failure.testCase.id,
        input: failure.testCase.input,
        expectedIntent: failure.testCase.expectedIntent,
        actualIntent: failure.actual.intent,
        actualReason: failure.actual.reason,
        actualConfidence: failure.actual.confidence,
        errors: failure.errors,
      })),
      null,
      2,
    ),
  );

  console.error(`AI routing eval failed: ${failures.length}/${cases.length}`);
  console.error(`Failure log written to ${failureLogPath}`);
  for (const failure of failures) {
    console.error(`\n[${failure.testCase.group}] ${failure.testCase.id}`);
    console.error(`input: ${failure.testCase.input}`);
    console.error(`actual: ${JSON.stringify(failure.actual)}`);
    for (const error of failure.errors) console.error(`- ${error}`);
  }
  process.exit(1);
}

const groups = cases.reduce<Record<string, number>>((acc, testCase) => {
  acc[testCase.group] = (acc[testCase.group] || 0) + 1;
  return acc;
}, {});

console.log(`AI routing eval passed: ${cases.length}/${cases.length}`);
console.log(`Groups: ${Object.entries(groups).map(([group, count]) => `${group}=${count}`).join(', ')}`);
