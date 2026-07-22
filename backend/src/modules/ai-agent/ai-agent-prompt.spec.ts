import { buildSystemPrompt } from './ai-agent-prompt';

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
});
