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
] as const;

const FALLBACK_MESSAGE =
  'Mình đã chặn một lệnh nội bộ bị lộ trong phản hồi của AI. Bạn thử gửi lại câu hỏi ngắn hơn nhé.';

export type SanitizedAiResponse = {
  content: string;
  sanitized: boolean;
  reasons: string[];
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactContent(content: string) {
  return content
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function containsToolName(content: string) {
  return INTERNAL_TOOL_NAMES.some((toolName) =>
    new RegExp(`\\b${escapeRegex(toolName)}\\s*\\(`, 'i').test(content),
  );
}

function containsFencedToolCall(content: string) {
  const fencedBlocks = content.match(/```[\s\S]*?```/g) || [];
  return fencedBlocks.some((block) => {
    if (/<function[=:]/i.test(block)) return true;
    if (containsToolName(block)) return true;
    return /"(name|function_name)"\s*:\s*"[^"]+"/i.test(block);
  });
}

function removePseudoFunctionTags(content: string) {
  return content
    .replace(/<function[=:][\s\S]*?<\/function>/gi, '')
    .replace(/<function[=:][^>]*\/?>/gi, '');
}

function removeFencedToolCalls(content: string) {
  return content.replace(/```[\s\S]*?```/g, (block) => (containsFencedToolCall(block) ? '' : block));
}

function removeRawToolCalls(content: string) {
  let output = content;

  for (const toolName of INTERNAL_TOOL_NAMES) {
    const escaped = escapeRegex(toolName);
    output = output.replace(new RegExp(`\\b${escaped}\\s*\\(\\s*\\{[\\s\\S]*?\\}\\s*\\)`, 'gi'), '');
    output = output.replace(new RegExp(`\\b${escaped}\\s*\\(\\s*\\{[\\s\\S]*$`, 'gi'), '');
  }

  return output;
}

function stripToolPrelude(content: string) {
  const normalized = content.toLowerCase();
  const likelyPrelude =
    normalized.includes('tôi sẽ tìm') ||
    normalized.includes('de biet') ||
    normalized.includes('để biết') ||
    normalized.includes('i will search') ||
    normalized.includes('let me search');

  return likelyPrelude ? '' : content;
}

function detectReasons(original: string) {
  const reasons: string[] = [];
  if (/<function[=:]/i.test(original)) reasons.push('pseudo_function_tag');
  if (containsToolName(original)) reasons.push('raw_tool_call');
  if (containsFencedToolCall(original)) reasons.push('fenced_tool_call');
  if (/"(name|function_name)"\s*:\s*"[^"]+"/i.test(original)) reasons.push('json_tool_call');
  return Array.from(new Set(reasons));
}

export function sanitizeAiResponse(content: string, fallback = FALLBACK_MESSAGE): SanitizedAiResponse {
  const original = String(content || '');
  const reasons = detectReasons(original);

  if (reasons.length === 0) {
    return { content: original, sanitized: false, reasons: [] };
  }

  const stripped = compactContent(
    stripToolPrelude(removeRawToolCalls(removePseudoFunctionTags(removeFencedToolCalls(original)))),
  );

  return {
    content: stripped || fallback,
    sanitized: true,
    reasons,
  };
}

export function hasRawToolLeakage(content: string) {
  return detectReasons(String(content || '')).length > 0;
}
