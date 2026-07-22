import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseCalendarMutation } from '../src/modules/ai-agent/ai-calendar-mutation-parser';

type ActionEvalCase = {
  id: string;
  group: string;
  input: string;
  expectedAction?: string;
  expectedLookupTitle?: string;
  expectedLookupDate?: string;
  expectedLookupTime?: string;
  expectedTitle?: string;
  expectedDate?: string;
  expectedEndDate?: string;
  expectedTime?: string;
  expectedScope?: string;
  shouldAskClarification?: boolean;
};

const filePath = join(process.cwd(), 'scripts', 'ai-action-evals.json');
const cases = JSON.parse(readFileSync(filePath, 'utf8')) as ActionEvalCase[];
const failures: Array<{ testCase: ActionEvalCase; actual: any; errors: string[] }> = [];

function assertEqual(errors: string[], label: string, expected: any, actual: any) {
  if (expected !== undefined && actual !== expected) {
    errors.push(`${label} expected ${expected}, got ${actual}`);
  }
}

for (const testCase of cases) {
  const actual = parseCalendarMutation(testCase.input, 'family_123');
  const errors: string[] = [];

  if (!actual) {
    errors.push('parser returned undefined');
  } else {
    assertEqual(errors, 'action', testCase.expectedAction, actual.action);
    assertEqual(errors, 'lookup.title', testCase.expectedLookupTitle, actual.lookup?.title);
    assertEqual(errors, 'lookup.date', testCase.expectedLookupDate, actual.lookup?.date);
    assertEqual(errors, 'lookup.time', testCase.expectedLookupTime, actual.lookup?.time);
    assertEqual(errors, 'title', testCase.expectedTitle, actual.args?.title);
    assertEqual(errors, 'date', testCase.expectedDate, actual.args?.date);
    assertEqual(errors, 'endDate', testCase.expectedEndDate, actual.args?.endDate);
    assertEqual(errors, 'time', testCase.expectedTime, actual.args?.time);
    assertEqual(errors, 'scope', testCase.expectedScope, actual.args?.scope);

    if (
      typeof testCase.shouldAskClarification === 'boolean' &&
      Boolean(actual.needsClarification) !== testCase.shouldAskClarification
    ) {
      errors.push(`shouldAskClarification expected ${testCase.shouldAskClarification}, got ${Boolean(actual.needsClarification)}`);
    }
  }

  if (errors.length > 0) failures.push({ testCase, actual, errors });
}

if (failures.length > 0) {
  const failureLogPath = join(process.cwd(), 'scripts', 'ai-action-failures.generated.json');
  writeFileSync(
    failureLogPath,
    JSON.stringify(
      failures.map((failure) => ({
        id: failure.testCase.id,
        input: failure.testCase.input,
        actual: failure.actual,
        errors: failure.errors,
      })),
      null,
      2,
    ),
  );

  console.error(`AI action eval failed: ${failures.length}/${cases.length}`);
  console.error(`Failure log written to ${failureLogPath}`);
  for (const failure of failures) {
    console.error(`\n[${failure.testCase.group}] ${failure.testCase.id}`);
    for (const error of failure.errors) console.error(`- ${error}`);
  }
  process.exit(1);
}

const groups = cases.reduce<Record<string, number>>((acc, testCase) => {
  acc[testCase.group] = (acc[testCase.group] || 0) + 1;
  return acc;
}, {});

console.log(`AI action eval passed: ${cases.length}/${cases.length}`);
console.log(`Groups: ${Object.entries(groups).map(([group, count]) => `${group}=${count}`).join(', ')}`);
