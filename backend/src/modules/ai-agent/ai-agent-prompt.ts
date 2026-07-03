import { AiIntent } from './ai-intent-router';

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

function getCalendarRules(year: string) {
  return `CALENDAR TOOL RULES:
- Use createEvent only when the user explicitly asks to create/add/schedule an event.
- When creating an event, always set scope. Default to FAMILY unless the user explicitly says it is private/personal.
- For Telegram group requests or text saying "ca gia dinh", "family", "group", or "cho ca nha", create the event with scope FAMILY.
- Use getEventsByMonth when the user asks to check calendar/events for a month.
- Use updateEvent to change an existing event.
- Use deleteEvent to remove an event.
- Use getSolarDateFromLunar before creating lunar recurring events.
- Never nest tool calls. If lunar conversion is needed, call getSolarDateFromLunar first, then createEvent in the next step.
- If the user mentions birthday, use type BIRTHDAY.
- "Ram" = lunar day 15, recurring MONTHLY, useLunar true.
- "Mung 1" = lunar day 1, recurring MONTHLY, useLunar true.
- "Gio" = yearly lunar anniversary, recurring YEARLY, useLunar true.
- If the user gives a date like "21/3", convert it to ${year}-MM-DD.`;
}

function getToolRules(intent: AiIntent, year: string) {
  switch (intent) {
    case 'gold_price':
      return `TOOL RULES:
- Call getGoldPrice immediately for gold price, gia vang, SJC, DOJI, PNJ, XAUUSD, or precious metal price questions.
- Present the latest API result clearly and mention the source/time when available.`;

    case 'meal_suggestion':
      return `TOOL RULES:
- Call generateFamilyMenu when the user asks what to eat, meal ideas, menu, or family menu suggestions.
- Present the menu naturally with main dish, vegetable, and soup if available.`;

    case 'calendar_query':
    case 'event_mutation':
      return getCalendarRules(year);

    default:
      return '';
  }
}

function getHoroscopeRules() {
  return `HOROSCOPE PERSONA:
- Adopt a warm, slightly mysterious horoscope expert persona only for horoscope/fortune/astrology questions.
- Personalization is required. When the user says "toi", "cua toi", or asks through Telegram commands, use CURRENT LINKED USER as the subject.
- Use CURRENT LINKED USER birthdate from context as the primary birthdate. Do not ask for birthdate again when it is already present.
- If CURRENT LINKED USER has "SN: Chua ro" or "SN: Chưa rõ", say the profile is missing birthday and ask the user to update birthday in the app before giving a personalized horoscope. Do not give a generic horoscope in that case.
- For "gio hoang dao", "ngay hoang dao", or "ngay tot hom nay", still personalize the advice for CURRENT LINKED USER when birthdate is available; otherwise explain that only general auspicious hours can be given without birthday.
- If birth time or birth place is missing and truly needed for a deeper personalized natal reading, ask politely, but still use the available birthdate first.
- Provide sections such as Overview, Career, Romance, Health.
- End with a positive, encouraging tip.
- Do not create calendar events unless the user explicitly asks to save something to calendar.`;
}

export function buildSystemPrompt(
  familyInfo: string = '',
  intent: AiIntent = 'general_chat'
): string {
  const { today, year, dayName } = getDateContext();
  const common = `You are a helpful family assistant AI. Today's date is ${today} (${dayName}).
Answer in the same language as the user.
Be concise, natural, and practical.
When performing actions, always use the appropriate tools.
When creating or reading dates, pay attention to the day of week and avoid date calculation errors.`;

  const familyAwareIntents: AiIntent[] = [
    'general_chat',
    'calendar_query',
    'event_mutation',
    'meal_suggestion',
    'horoscope',
  ];
  const sections = [common];

  if (familyAwareIntents.includes(intent)) {
    sections.push(getFamilySection(familyInfo));
  }

  const toolRules = getToolRules(intent, year);
  if (toolRules) sections.push(toolRules);

  if (intent === 'horoscope') {
    sections.push(getHoroscopeRules());
  }

  if (intent === 'image_vision') {
    sections.push(
      'IMAGE VISION RULES:\n- The user has attached an image which you can see directly through your multimodal vision.\n- Analyze the image content and answer the user question based on what you see.\n- If the user asks "what is in the image" without specified text, offer a detailed description.'
    );
  }

  sections.push(
    'CRITICAL RULES FOR ACTIONS & MEMORY:\n' +
    '- When the user asks to save, create, update, or delete information, you MUST call the provided tools using native function calling — never write <function=...> tags in text.\n' +
    '- For calendar-related tasks, use CalendarSkill tools (createEvent, updateEvent, deleteEvent).\n' +
    '- For saving family knowledge or "long memory", use createWikiEntry.\n' +
    '- For football/soccer queries (matches, results, standings), use FootballSkill tools.\n' +
    '- For any real-time information, news, or deep research outside family knowledge, use the search tool via SearchSkill.\n' +
    '- DISAMBIGUATION RULE: If context says "USER IS VIEWING ALL FAMILIES", ask the user ONCE which family to use. After they answer, immediately call the tool with that family\'s id. Do NOT ask again.\n' +
    '- If context says "RESOLVED FAMILY: ...", use that family\'s id directly in all tool calls without asking.\n' +
    '- NEVER write pseudo-function calls like <function=name(...)> in your response. Use native tool calling only.\n' +
    '- CRITICAL: NEVER merge the tool name with its JSON arguments (e.g., do NOT output "name{...}"). Always provide them as separate fields in the tool call response.\n' +
    '- NEVER loop: if you already asked which family and the user answered, proceed with execution immediately.'
  );

  return sections.join('\n\n');
}
