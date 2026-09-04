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

  it('strips <think> reasoning blocks and their content, keeping the real answer', () => {
    const result = sanitizeAiResponse('<think>Let me analyze this step by step...</think>Chào cả nhà, hôm nay trời đẹp!');

    expect(result.sanitized).toBe(true);
    expect(result.reasons).toContain('thought_tag');
    expect(result.content).toBe('Chào cả nhà, hôm nay trời đẹp!');
    expect(result.content).not.toContain('analyze');
  });

  it('strips a truncated/unclosed <think> block through end of string instead of leaking it', () => {
    const result = sanitizeAiResponse('<think>Here is a thinking process: 1. Analyze user input...', '');

    expect(result.sanitized).toBe(true);
    expect(result.content).toBe('');
  });

  it('strips <thought> reasoning blocks and their content (legacy tag name)', () => {
    const result = sanitizeAiResponse('<thought>internal reasoning</thought>Câu trả lời thật.');

    expect(result.sanitized).toBe(true);
    expect(result.content).toBe('Câu trả lời thật.');
    expect(result.content).not.toContain('internal reasoning');
  });

  it('strips a stray </thought> closing tag with no matching opening tag, along with the reasoning prose before it', () => {
    // Observed in production on /football replies: the opening <thought> tag never made it
    // into the final content (dropped upstream), but the closing tag and the reasoning
    // bullet points before it did — leaking planning prose and leaving Telegram's HTML
    // parser choking on the unrecognized </thought> tag (which made it fall back to plain
    // text and show every <b>/<i> tag literally instead of rendering them).
    const result = sanitizeAiResponse(
      '- Su dung tieng Viet hoan toan.\n- Nhom cac tran dau theo giai dau.\n</thought><b>⚽ Lịch thi đấu</b>\n- 20:00: Việt Nam vs Thái Lan',
    );

    expect(result.sanitized).toBe(true);
    expect(result.content).toBe('<b>⚽ Lịch thi đấu</b>\n- 20:00: Việt Nam vs Thái Lan');
    expect(result.content).not.toContain('</thought>');
    expect(result.content).not.toContain('Nhom cac tran dau');
  });
});
