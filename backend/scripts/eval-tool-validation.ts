import { getTools } from '../src/modules/ai-agent/ai-agent-tools';
import { validateToolArgs } from '../src/modules/ai-agent/ai-tool-runtime';

const tools = getTools();

const cases = [
  {
    id: 'createEvent.valid',
    tool: 'createEvent',
    args: { title: 'Da bong', date: '2026-07-01', time: '20:00', scope: 'FAMILY' },
    ok: true,
  },
  {
    id: 'createEvent.missingDate',
    tool: 'createEvent',
    args: { title: 'Da bong' },
    ok: false,
  },
  {
    id: 'createEvent.badDate',
    tool: 'createEvent',
    args: { title: 'Da bong', date: '01/07/2026' },
    ok: false,
  },
  {
    id: 'createEvent.badScope',
    tool: 'createEvent',
    args: { title: 'Da bong', date: '2026-07-01', scope: 'TEAM' },
    ok: false,
  },
  {
    id: 'getEventsByMonth.valid',
    tool: 'getEventsByMonth',
    args: { familyId: 'all', month: 7, year: 2026 },
    ok: true,
  },
  {
    id: 'getEventsByMonth.missingFamily',
    tool: 'getEventsByMonth',
    args: { month: 7, year: 2026 },
    ok: false,
  },
];

const failures = cases
  .map((testCase) => ({ testCase, result: validateToolArgs(testCase.tool, testCase.args, tools) }))
  .filter(({ testCase, result }) => result.ok !== testCase.ok);

if (failures.length > 0) {
  console.error(`Tool validation eval failed: ${failures.length}/${cases.length}`);
  for (const failure of failures) {
    console.error(`\n${failure.testCase.id}`);
    console.error(`expected ok=${failure.testCase.ok}, actual ok=${failure.result.ok}`);
    console.error(`errors: ${failure.result.errors.join('; ')}`);
  }
  process.exit(1);
}

console.log(`Tool validation eval passed: ${cases.length}/${cases.length}`);
