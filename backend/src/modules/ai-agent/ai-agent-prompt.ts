function getDateContext() {
  const now = new Date();
  const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const today = ictDate.toISOString().split('T')[0];
  const days = ['Chu nhat', 'Thu hai', 'Thu ba', 'Thu tu', 'Thu nam', 'Thu sau', 'Thu bay'];

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
  const common = `You are a helpful family assistant AI. Today's date is ${today} (${dayName}).
Answer in the same language as the user.
Be concise, natural, and practical.
When performing actions, always use the appropriate tools.
When creating or reading dates, pay attention to the day of week and avoid date calculation errors.
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
  ];

  return sections.join('\n\n');
}

/**
 * Compose the base prompt plus the persona/rule prose of only the most-recently-invoked
 * skill, if any — every skill's tools remain available every turn regardless of this filter
 * (the tool list is never filtered; only this supplementary persona/rule prose is). When
 * recentSkillName is omitted or matches no registered skill, no skill-specific persona prose
 * is included at all — just the base prompt.
 *
 * Takes a minimal structural type for the registry parameter instead of the
 * concrete AiSkillRegistry class, to avoid adding a new import dependency to
 * this fairly foundational file.
 */
export function composeFullPrompt(
  skillRegistry: { getAllSkills(): Array<{ name: string; getSystemPrompt(context: any): string }> },
  skillContext: { familyContext?: string; [key: string]: any },
  recentSkillName?: string,
): string {
  const base = buildSystemPrompt(skillContext.familyContext || '');
  const relevantSkills = recentSkillName
    ? skillRegistry.getAllSkills().filter((skill) => skill.name === recentSkillName)
    : [];
  const skillPrompts = relevantSkills
    .map((candidateSkill) => candidateSkill.getSystemPrompt(skillContext))
    .filter(Boolean);
  return [base, ...skillPrompts].join('\n\n');
}
