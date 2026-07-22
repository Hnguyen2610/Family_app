import { hasRawToolLeakage, sanitizeAiResponse } from './ai-response-sanitizer';

describe('sanitizeAiResponse', () => {
  it('blocks pseudo function tags', () => {
    const result = sanitizeAiResponse('<function=createEvent({"title":"Test"})></function>');

    expect(result.sanitized).toBe(true);
    expect(result.reasons).toContain('pseudo_function_tag');
    expect(result.content).not.toContain('<function');
  });

  it('blocks raw internetSearch calls', () => {
    const result = sanitizeAiResponse(`Tôi sẽ tìm thông tin.

internetSearch({
  "query": "lich thi dau Argentina"
})`);

    expect(result.sanitized).toBe(true);
    expect(result.reasons).toContain('raw_tool_call');
    expect(result.content).not.toContain('internetSearch');
  });

  it('blocks fenced tool calls', () => {
    const result = sanitizeAiResponse('```json\n{"name":"createEvent","arguments":{"title":"A"}}\n```');

    expect(result.sanitized).toBe(true);
    expect(result.reasons).toContain('fenced_tool_call');
    expect(result.content).not.toContain('createEvent');
  });

  it('blocks malformed JSON tool calls', () => {
    const result = sanitizeAiResponse('internetSearch({"query":"weather today"');

    expect(result.sanitized).toBe(true);
    expect(result.content).not.toContain('internetSearch');
  });

  it('leaves normal answers untouched', () => {
    const content = 'Lịch hôm nay không có sự kiện nào.';
    const result = sanitizeAiResponse(content);

    expect(result).toEqual({ content, sanitized: false, reasons: [] });
    expect(hasRawToolLeakage(content)).toBe(false);
  });
});
