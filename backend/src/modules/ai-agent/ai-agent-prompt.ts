import { getIctShiftedNow } from '../../utils/timezone.util';

function getDateContext() {
  const ictDate = getIctShiftedNow();
  const today = ictDate.toISOString().split('T')[0];
  // Full diacritics on purpose: an unaccented "Thu sau" reads as ambiguous shorthand rather
  // than an explicit day-of-week value, and models were observed re-deriving (and getting
  // wrong) the weekday themselves instead of just repeating this string verbatim.
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  return {
    today,
    year: today.substring(0, 4),
    dayName: days[ictDate.getUTCDay()],
  };
}

function getFamilySection(familyInfo: string) {
  return `FAMILY MEMBERS INFORMATION:
${familyInfo ? familyInfo : 'Khong co thong tin thanh vien.'}

If FAMILY WIKI RETRIEVED CONTEXT is present, use it as retrieved family notes. Do not invent details outside that context.`;
}

export function buildSystemPrompt(familyInfo: string = ''): string {
  const { today, dayName } = getDateContext();
  const common = `You are a helpful family assistant AI. Today's date is ${today}, and the day of week is "${dayName}".
When telling the user today's date or day of week, always state it EXACTLY as given above — never calculate or re-derive the day of week yourself, manual weekday arithmetic is unreliable and has produced wrong answers before.
Answer in the same language as the user.
Be concise, natural, and practical.
When performing actions, always use the appropriate tools.
When creating or reading OTHER dates (not today), pay attention to the day of week and avoid date calculation errors.
CRITICAL LANGUAGE CONSTRAINT:
- NEVER mix external languages (like Chinese characters: 作为, etc.) in your Vietnamese responses.
- Ensure the response is 100% in pure Vietnamese. For example, translate terms like "as" to "làm" or "là" instead of "作为".`;

  const sections = [
    common,
    getFamilySection(familyInfo),
    'IMAGE VISION RULES:\n- If the user has attached an image, you can see it directly through your multimodal vision. Analyze the image content and answer the user question based on what you see. If the user asks "what is in the image" without specified text, offer a detailed description. If no image is attached, ignore this section.',
    'CRITICAL RULES FOR ACTIONS & MEMORY:\n' +
    '- When the user asks to save, create, update, or delete information, you MUST call the provided tools using native function calling — never write <function=...> tags in text.\n' +
    '- For family-specific facts, preferences, or memories you do not already have in context, use searchFamilyNotes before answering — do not guess.\n' +
    '- DISAMBIGUATION RULE: If context says "USER IS VIEWING ALL FAMILIES", ask the user ONCE which family to use before any tool call that writes data. After they answer, immediately call the tool with that family\'s id. Do NOT ask again.\n' +
    '- If context says "RESOLVED FAMILY: ...", use that family\'s id directly in all tool calls without asking.\n' +
    '- NEVER write pseudo-function calls like <function=name(...)> in your response. Use native tool calling only.\n' +
    '- CRITICAL: NEVER merge the tool name with its JSON arguments (e.g., do NOT output "name{...}"). Always provide them as separate fields in the tool call response.\n' +
    '- NEVER loop: if you already asked which family and the user answered, proceed with execution immediately.',
    'CRITICAL RULE — NEVER FABRICATE "NO DATA" ANSWERS:\n' +
    '- Never tell the user there are no events, no notes, no memories, or no records of any kind unless you actually called the matching tool (e.g. getEventsByMonth, searchFamilyNotes) THIS turn and it returned an empty result.\n' +
    '- If the question does not require checking stored family data (e.g. "what is today\'s date", general knowledge, small talk), just answer it directly — do NOT mention events, calendars, or checking any data source at all.\n' +
    '- When in doubt whether a tool applies, either call the tool or answer generally — never guess that something is empty or missing.',
  ];

  return sections.join('\n\n');
}

/**
 * Compose the base prompt plus persona/rule prose — every skill's tools remain available
 * every turn regardless of this filter (the tool list is never filtered; only this
 * supplementary persona/rule prose is).
 *
 * When recentSkillName matches a registered skill (i.e. we have a real signal for which
 * skill was just used), only that skill's persona prose is included, to save tokens on
 * the common case of an ongoing conversation. When recentSkillName is omitted or matches
 * no registered skill — i.e. we have no signal yet, typically the first message of a
 * session — ALL registered skills' persona prose is included instead of none, so the model
 * still gets each skill's specific tool-usage guidance on a cold start. Eval runs found this
 * blind spot: bare tool descriptions alone were not enough for the model to reliably call
 * the right tool on a first message with no prior lastIntent.
 *
 * Returns the two pieces separately (rather than one joined string) so callers can place
 * personaSuffix at the very end of what's sent to the model, keeping basePrompt + accumulated
 * history as a stable, cacheable prefix for Groq/Gemini's automatic prompt caching.
 *
 * Takes a minimal structural type for the registry parameter instead of the
 * concrete AiSkillRegistry class, to avoid adding a new import dependency to
 * this fairly foundational file.
 */
export function composeFullPrompt(
  skillRegistry: { getAllSkills(): Array<{ name: string; getSystemPrompt(context: any): string }> },
  skillContext: { familyContext?: string; [key: string]: any },
  recentSkillName?: string,
): { basePrompt: string; personaSuffix: string } {
  const basePrompt = buildSystemPrompt(skillContext.familyContext || '');
  const allSkills = skillRegistry.getAllSkills();
  const matchedSkill = recentSkillName
    ? allSkills.find((skill) => skill.name === recentSkillName)
    : undefined;
  const relevantSkills = matchedSkill ? [matchedSkill] : allSkills;
  const personaProse = relevantSkills
    .map((candidateSkill) => candidateSkill.getSystemPrompt(skillContext))
    .filter(Boolean)
    .join('\n\n');
  // recentSkillName reflects whichever skill's tool was invoked most recently for this
  // user — persisted across sessions (AiConversationStateService keys on userId, not on
  // a chat session, and its 60-minute TTL slides forward on every tool-invoking turn).
  // So a "matched" skill here is NOT a guarantee the current message is on-topic for it —
  // it may simply be stale carry-over from an unrelated earlier conversation. Observed in
  // practice: without a scoping preamble, a stale CalendarSkill match made the model answer
  // an unrelated date question ("hom nay la ngay bao nhieu") in event-checking language
  // ("Khong co su kien nao...") despite calling zero tools. Always scope persona prose —
  // matched or bundled — to "apply only if relevant" so staleness degrades to silently
  // unused text, never to tone bleeding into an unrelated reply.
  const personaSuffix = personaProse
    ? `The following are topic-specific rules from the skill(s) most recently used. Apply them ONLY if relevant to what the user is actually asking right now; if the current message is on a different topic, ignore them entirely.\n\n${personaProse}`
    : personaProse;
  return { basePrompt, personaSuffix };
}
