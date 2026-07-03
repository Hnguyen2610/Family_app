/**
 * ai-confusion-log.ts
 *
 * In-memory store for intent routing confusion cases.
 * A "confusion case" is when the rule router and LLM classifier disagree on intent.
 * These are logged to identify patterns and improve the rule router over time.
 */

export type ConfusionCase = {
  id: string;
  timestamp: string;
  userMessage: string;
  ruleIntent: string;
  ruleReason: string;
  classifierIntent: string;
  classifierConfidence: number;
  classifierReason: string;
  selectedSkill?: string;
  outcome?: string;
  error?: string;
};

const MAX_CASES = 200;
const cases: ConfusionCase[] = [];
let counter = 0;

export function appendConfusionCase(entry: Omit<ConfusionCase, 'id' | 'timestamp'>) {
  const record: ConfusionCase = {
    id: `confusion-${++counter}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  if (cases.length >= MAX_CASES) {
    cases.shift();
  }
  cases.push(record);
}

export function getConfusionCases(limit = 50): ConfusionCase[] {
  return cases.slice(-limit).reverse();
}

export function getConfusionStats() {
  if (cases.length === 0) return { total: 0, byRuleIntent: {}, byClassifierIntent: {} };

  const byRuleIntent: Record<string, number> = {};
  const byClassifierIntent: Record<string, number> = {};

  for (const c of cases) {
    byRuleIntent[c.ruleIntent] = (byRuleIntent[c.ruleIntent] || 0) + 1;
    byClassifierIntent[c.classifierIntent] = (byClassifierIntent[c.classifierIntent] || 0) + 1;
  }

  return { total: cases.length, byRuleIntent, byClassifierIntent };
}
