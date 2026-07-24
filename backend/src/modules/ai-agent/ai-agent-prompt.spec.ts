import { buildSystemPrompt, composeFullPrompt } from './ai-agent-prompt';

describe('buildSystemPrompt', () => {
  it('builds one prompt with no intent argument', () => {
    const prompt = buildSystemPrompt('CURRENT LINKED USER: Test User');
    expect(prompt).toContain('CURRENT LINKED USER: Test User');
    expect(prompt).toContain('helpful family assistant');
  });

  it('always includes the generic action/memory rules', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).toContain('CRITICAL RULES FOR ACTIONS & MEMORY');
    expect(prompt).toContain('searchFamilyNotes');
  });

  it('no longer renders skill-specific tool rules directly (those come from each skill\'s own getSystemPrompt, concatenated by AiAgentService)', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).not.toContain('CALENDAR TOOL RULES');
    expect(prompt).not.toContain('HOROSCOPE PERSONA');
  });

  it('states today\'s day-of-week with full diacritics and instructs the model to repeat it verbatim instead of recalculating it (regression: model previously miscalculated "hom nay la thu may" even though the correct weekday was already given as unaccented "Thu sau" shorthand)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-24T02:00:00.000Z')); // 2026-07-24 is a Friday
    try {
      const prompt = buildSystemPrompt('');
      expect(prompt).toContain('"Thứ Sáu"');
      expect(prompt).toContain('never calculate or re-derive the day of week yourself');
    } finally {
      jest.useRealTimers();
    }
  });

  it('always includes a hard guard against fabricating "no data" answers without an actual tool call', () => {
    const prompt = buildSystemPrompt('');
    expect(prompt).toContain('NEVER FABRICATE "NO DATA" ANSWERS');
    expect(prompt).toContain('THIS turn');
  });
});

describe('composeFullPrompt', () => {
  const registry = {
    getAllSkills: () => [
      { name: 'CalendarSkill', getSystemPrompt: () => 'CALENDAR TOOL RULES: ...' },
      { name: 'MealSkill', getSystemPrompt: () => 'MEAL RULES: ...' },
    ],
  };

  it('trả về basePrompt không lẫn prose của bất kỳ skill nào', () => {
    const { basePrompt } = composeFullPrompt(registry, { familyContext: 'Family X' }, 'CalendarSkill');
    expect(basePrompt).toContain('helpful family assistant');
    expect(basePrompt).toContain('Family X');
    expect(basePrompt).not.toContain('CALENDAR TOOL RULES');
    expect(basePrompt).not.toContain('MEAL RULES');
  });

  it('trả về personaSuffix chỉ chứa prose của skill khớp recentSkillName (kèm câu dẫn "chỉ áp dụng nếu liên quan")', () => {
    const { personaSuffix } = composeFullPrompt(registry, {}, 'CalendarSkill');
    expect(personaSuffix).toContain('CALENDAR TOOL RULES: ...');
    expect(personaSuffix).not.toContain('MEAL RULES');
    expect(personaSuffix.indexOf('Apply them ONLY if relevant')).toBeLessThan(personaSuffix.indexOf('CALENDAR TOOL RULES'));
  });

  it('trả về personaSuffix gồm TẤT CẢ skill khi recentSkillName bị thiếu hoặc không khớp skill nào (cold start, chưa có tín hiệu)', () => {
    const missingSignal = composeFullPrompt(registry, {}).personaSuffix;
    expect(missingSignal).toContain('CALENDAR TOOL RULES');
    expect(missingSignal).toContain('MEAL RULES');

    const unmatchedSignal = composeFullPrompt(registry, {}, 'NoSuchSkill').personaSuffix;
    expect(unmatchedSignal).toContain('CALENDAR TOOL RULES');
    expect(unmatchedSignal).toContain('MEAL RULES');
  });

  it('LUÔN thêm câu dẫn "chỉ áp dụng nếu liên quan" bất kể 1 skill khớp hay gộp nhiều skill — vì recentSkillName có thể là tín hiệu CŨ từ phiên trước không liên quan tới câu hỏi hiện tại', () => {
    const singleMatch = composeFullPrompt(registry, {}, 'CalendarSkill').personaSuffix;
    expect(singleMatch).toContain('Apply them ONLY if relevant');

    const bundledColdStart = composeFullPrompt(registry, {}).personaSuffix;
    expect(bundledColdStart).toContain('Apply them ONLY if relevant');
    expect(bundledColdStart.indexOf('Apply them ONLY if relevant')).toBeLessThan(bundledColdStart.indexOf('CALENDAR TOOL RULES'));
  });

  it('không thêm câu dẫn khi personaSuffix rỗng (không có skill nào để gộp)', () => {
    const emptyRegistry = { getAllSkills: () => [] };
    expect(composeFullPrompt(emptyRegistry, {}).personaSuffix).toBe('');
  });
});
