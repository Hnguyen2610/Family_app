const INTERNAL_TOOL_NAMES = [
  'internetSearch',
  'search',
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'createWikiEntry',
  'proposeFamilyNote',
  'getEventsByMonth',
  'generateFamilyMenu',
  'getGoldPrice',
  'get_matches',
];

const FALLBACK_MESSAGE =
  'Mình đã chặn một lệnh nội bộ bị lộ trong phản hồi của model. Bạn thử gửi lại câu hỏi ngắn hơn nhé.';

export type SanitizedAiResponse = {
  content: string;
  sanitized: boolean;
  reasons: string[];
};

function compactContent(content: string) {
  return content
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removePseudoFunctionTags(content: string) {
  return content
    .replace(/<function[=:][\s\S]*?<\/function>/gi, '')
    .replace(/<function[=:][^>]*>/gi, '');
}

function removeRawToolCalls(content: string) {
  let output = content;

  for (const toolName of INTERNAL_TOOL_NAMES) {
    const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`\\b${escaped}\\s*\\(\\s*\\{[\\s\\S]*?\\}\\s*\\)`, 'gi'), '');
  }

  return output;
}

function detectReasons(original: string, sanitized: string) {
  const reasons: string[] = [];
  if (/<function[=:]/i.test(original)) reasons.push('pseudo_function_tag');
  if (INTERNAL_TOOL_NAMES.some((toolName) => new RegExp(`\\b${toolName}\\s*\\(`, 'i').test(original))) {
    reasons.push('raw_tool_call');
  }
  if (original !== sanitized && reasons.length === 0) reasons.push('content_sanitized');
  return reasons;
}

export function sanitizeAiResponse(content: string): SanitizedAiResponse {
  const original = String(content || '');
  const stripped = compactContent(removeRawToolCalls(removePseudoFunctionTags(original)));
  const reasons = detectReasons(original, stripped);

  if (reasons.length === 0) {
    return { content: original, sanitized: false, reasons: [] };
  }

  return {
    content: stripped || FALLBACK_MESSAGE,
    sanitized: true,
    reasons,
  };
}
