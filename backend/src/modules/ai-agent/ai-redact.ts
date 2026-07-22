/**
 * Redacts sensitive PII from user messages before sending to external AI providers.
 * Triggered per-intent to avoid over-censoring general conversation.
 */

export type RedactResult = {
  redacted: string;
  hits: string[]; // types of patterns found and redacted
};

type RedactRule = {
  name: string;
  pattern: RegExp;
  replacement: string;
};

// ─── Rules ───────────────────────────────────────────────────────────────────

const RULES: RedactRule[] = [
  // Credit / debit card numbers (16-digit, spaced or dashed)
  {
    name: 'CARD_NUMBER',
    pattern: /\b(?:\d[ -]?){13,16}\b/g,
    replacement: '[CARD_REDACTED]',
  },
  // Vietnamese CCCD / CMND (9 or 12 digits)
  {
    name: 'VN_ID',
    pattern: /\b\d{9}(?:\d{3})?\b/g,
    replacement: '[ID_REDACTED]',
  },
  // Vietnamese bank account (10-19 digits that don't look like phone/card)
  {
    name: 'BANK_ACCOUNT',
    pattern: /\b\d{10,19}\b/g,
    replacement: '[ACCT_REDACTED]',
  },
  // Vietnamese phone numbers: 03x, 07x, 08x, 09x, +84
  {
    name: 'PHONE_VN',
    pattern: /(?:\+84|0)(3[2-9]|5[6-9]|7[06-9]|8[0-9]|9[0-9])\d{7}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  // Email addresses
  {
    name: 'EMAIL',
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
  },
  // Passwords / tokens after common keywords
  {
    name: 'PASSWORD',
    pattern: /(?:password|passwd|mật khẩu|token|secret|api[_\s]?key)\s*[:=]\s*\S+/gi,
    replacement: '[SECRET_REDACTED]',
  },
];

// ─── Intents that ALWAYS trigger redaction ──────────────────────────────────

const ALWAYS_REDACT_INTENTS = new Set([
  'finance',
  'finance_analysis',
  'general_chat',
  'family_knowledge',
  'event_mutation',
]);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Redact sensitive PII from a user message.
 * @param text - raw user message
 * @param intent - classified AI intent
 * @param force - override to always redact regardless of intent
 */
export function redactSensitiveData(
  text: string,
  intent: string,
  force = false,
): RedactResult {
  // Only redact for high-risk intents unless forced
  if (!force && !ALWAYS_REDACT_INTENTS.has(intent)) {
    return { redacted: text, hits: [] };
  }

  let result = text;
  const hits: string[] = [];

  for (const rule of RULES) {
    const before = result;
    result = result.replace(rule.pattern, rule.replacement);
    if (result !== before) hits.push(rule.name);
  }

  return { redacted: result, hits };
}

/**
 * Lightweight check: does the message likely contain sensitive data?
 * Used for logging/alerting without needing full redaction pass.
 */
export function mightContainSensitiveData(text: string): boolean {
  return RULES.some(rule => {
    rule.pattern.lastIndex = 0; // reset stateful regex
    return rule.pattern.test(text);
  });
}
