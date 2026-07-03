import { parseCalendarMutation } from '../src/modules/ai-agent/ai-calendar-mutation-parser';

const familyId = 'family_123';

const cases = [
  {
    id: 'create.relativeDate.time.scope',
    input: 'tao lich da bong ngay mai luc 9 gio toi',
    expect: { action: 'create', title: 'da bong', time: '21:00', scope: 'FAMILY' },
  },
  {
    id: 'create.missingDate',
    input: 'them su kien hop phu huynh',
    expect: { action: 'create', clarification: true },
  },
  {
    id: 'delete.lookup',
    input: 'xoa su kien da bong ngay 30/7/2026',
    expect: { action: 'delete', lookupTitle: 'da bong', lookupDate: '2026-07-30' },
  },
  {
    id: 'update.byId',
    input: 'sua su kien id cmabc123456789 thanh Da bong voi ban luc 20:30',
    expect: { action: 'update', id: 'cmabc123456789', title: 'Da bong voi ban', time: '20:30' },
  },
];

const failures: string[] = [];

for (const testCase of cases) {
  const result = parseCalendarMutation(testCase.input, familyId);
  if (!result) {
    failures.push(`${testCase.id}: parser returned undefined`);
    continue;
  }

  if (result.action !== testCase.expect.action) {
    failures.push(`${testCase.id}: expected action ${testCase.expect.action}, got ${result.action}`);
  }
  if ('title' in testCase.expect && result.args.title !== testCase.expect.title) {
    failures.push(`${testCase.id}: expected title ${testCase.expect.title}, got ${result.args.title}`);
  }
  if ('time' in testCase.expect && result.args.time !== testCase.expect.time) {
    failures.push(`${testCase.id}: expected time ${testCase.expect.time}, got ${result.args.time}`);
  }
  if ('scope' in testCase.expect && result.args.scope !== testCase.expect.scope) {
    failures.push(`${testCase.id}: expected scope ${testCase.expect.scope}, got ${result.args.scope}`);
  }
  if ('clarification' in testCase.expect && !result.needsClarification) {
    failures.push(`${testCase.id}: expected clarification`);
  }
  if ('lookupTitle' in testCase.expect && result.lookup?.title !== testCase.expect.lookupTitle) {
    failures.push(`${testCase.id}: expected lookup title ${testCase.expect.lookupTitle}, got ${result.lookup?.title}`);
  }
  if ('lookupDate' in testCase.expect && result.lookup?.date !== testCase.expect.lookupDate) {
    failures.push(`${testCase.id}: expected lookup date ${testCase.expect.lookupDate}, got ${result.lookup?.date}`);
  }
  if ('id' in testCase.expect && result.args.id !== testCase.expect.id) {
    failures.push(`${testCase.id}: expected id ${testCase.expect.id}, got ${result.args.id}`);
  }
}

if (failures.length > 0) {
  console.error(`Calendar mutation parser eval failed: ${failures.length}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Calendar mutation parser eval passed: ${cases.length}/${cases.length}`);
