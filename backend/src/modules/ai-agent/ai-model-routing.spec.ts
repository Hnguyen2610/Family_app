import { routeAiModel } from './ai-model-routing';

describe('routeAiModel', () => {
  it('routes to Gemini vision when hasImage is true, regardless of selection', () => {
    const result = routeAiModel(undefined, true);
    expect(result.provider).toBe('gemini');
    expect(result.route).toBe('vision');
  });

  it('honors an explicit provider selection over the default tool route', () => {
    const result = routeAiModel('gemini', false);
    expect(result.provider).toBe('gemini');
    expect(result.route).toBe('explicit');
  });

  it('defaults every non-vision, non-explicit turn to the tool-capable route', () => {
    const result = routeAiModel(undefined, false);
    expect(result.provider).toBe('groq');
    expect(result.route).toBe('tool');
  });
});
