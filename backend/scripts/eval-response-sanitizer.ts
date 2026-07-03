import { sanitizeAiResponse } from '../src/modules/ai-agent/ai-response-sanitizer';

const cases = [
  {
    id: 'pseudo-function-tag',
    input: 'Dang xu ly\n<function=createEvent({"title":"Da bong"})></function>',
    expected: 'Dang xu ly',
  },
  {
    id: 'raw-internet-search',
    input: 'Toi se tim.\n\ninternetSearch({\n  "query": "lich thi dau Argentina"\n})',
    expected: 'Toi se tim.',
  },
  {
    id: 'plain-answer',
    input: 'Lich thi dau: Argentina vs Brazil luc 20:00.',
    expected: 'Lich thi dau: Argentina vs Brazil luc 20:00.',
  },
];

const failures = cases
  .map((testCase) => ({ testCase, result: sanitizeAiResponse(testCase.input) }))
  .filter(({ testCase, result }) => result.content !== testCase.expected);

if (failures.length > 0) {
  console.error(`Response sanitizer eval failed: ${failures.length}/${cases.length}`);
  for (const failure of failures) {
    console.error(`\n${failure.testCase.id}`);
    console.error(`expected: ${failure.testCase.expected}`);
    console.error(`actual: ${failure.result.content}`);
  }
  process.exit(1);
}

console.log(`Response sanitizer eval passed: ${cases.length}/${cases.length}`);
