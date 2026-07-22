/**
 * ai-intent-classifier.ts
 *
 * LLM-based intent classifier fallback.
 * Called when the deterministic rule router (ai-intent-router.ts) returns low-confidence
 * or routes to `needs_intent_classifier`.
 *
 * Also logs confusion cases: rule_route vs classifier_route discrepancies.
 */

import { Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { AiIntent, AiIntentRoute, normalizeSearchText } from './ai-intent-router';

const ALLOWED_INTENTS: AiIntent[] = [
  'general_chat',
  'calendar_query',
  'event_mutation',
  'gold_price',
  'meal_suggestion',
  'horoscope',
  'family_knowledge',
  'football',
  'weather',
  'web_search',
];

const TOOL_INTENTS = new Set<AiIntent>([
  'calendar_query',
  'event_mutation',
  'gold_price',
  'meal_suggestion',
  'football',
  'web_search',
]);

const CLASSIFIER_SYSTEM_PROMPT = [
  'You are an intent classifier for a Vietnamese family assistant.',
  'Return ONLY compact JSON with keys: intent, requiresTools, confidence, reason.',
  `Allowed intents: ${ALLOWED_INTENTS.join(', ')}.`,
  'Use football for general football/soccer schedules, results, scores, or standings when the user asks by competition/league/tournament or asks for top matches today.',
  'Use weather for weather forecasts, current weather, rain chance, humidity, or temperature questions.',
  'Use web_search for schedules of a specific named team, club, or national team, even when a tournament such as World Cup is mentioned.',
  'Use web_search for current facts, latest information, news, prices, or questions that need the internet but are not handled by a specific skill.',
  'Use family_knowledge for questions about saved family notes, preferences, memories, or household knowledge.',
  'Use calendar_query for checking existing events; event_mutation for creating/updating/deleting events.',
  'If unsure, use general_chat with confidence below 0.65.',
].join('\n');

export type ClassifierResult = AiIntentRoute & {
  classifiedBy: 'rule' | 'llm' | 'rule_after_llm_fail';
  ruleIntent?: AiIntent;
  ruleReason?: string;
  classifierIntent?: AiIntent;
  classifierReason?: string;
};

export class AiIntentClassifier {
  private readonly logger = new Logger(AiIntentClassifier.name);

  constructor(
    private readonly openai: OpenAI,
    private readonly model: string,
  ) {}

  shouldUseLlmFallback(route: AiIntentRoute, userMessage: string, hasImage: boolean): boolean {
    if (hasImage) return false;

    const needsClassifier = route.reason.startsWith('needs_intent_classifier');
    const isLowConfidenceGeneral =
      route.intent === 'general_chat' &&
      ['no_tool_keyword', 'ambiguous_schedule_keyword'].includes(route.reason);
    const isLowConfidenceRealtime =
      route.confidence <= 0.85 &&
      route.reason === 'realtime_search_keyword';

    if (!needsClassifier && !isLowConfidenceGeneral && !isLowConfidenceRealtime) return false;

    const normalized = normalizeSearchText(userMessage || '').trim();
    if (!normalized || normalized.length < 8) return false;

    const greetings = ['xin chao', 'hello', 'hi', 'chao', 'ok', 'oke', 'cam on', 'thanks'];
    return !greetings.includes(normalized);
  }

  async classify(
    userMessage: string,
    ruleRoute: AiIntentRoute,
  ): Promise<ClassifierResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 150,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'intent_classification',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                intent: {
                  type: 'string',
                  enum: ALLOWED_INTENTS,
                },
                requiresTools: {
                  type: 'boolean',
                },
                confidence: {
                  type: 'number',
                },
                reason: {
                  type: 'string',
                },
              },
              required: ['intent', 'requiresTools', 'confidence', 'reason'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      });

      const raw = response.choices[0]?.message?.content || '';
      const parsed = this.parseJson(raw);
      const intent = this.normalizeIntent(parsed?.intent);
      const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0;

      if (!intent || confidence < 0.65) {
        this.logger.debug(`[Classifier] Low confidence (${confidence}) or unknown intent — keeping rule route: ${ruleRoute.intent}`);
        return {
          ...ruleRoute,
          classifiedBy: 'rule_after_llm_fail',
          ruleIntent: ruleRoute.intent,
          ruleReason: ruleRoute.reason,
          classifierReason: String(parsed?.reason || 'low_confidence'),
        };
      }

      // Correct: if football but looks like specific team query → web_search
      let finalIntent = intent;
      if (finalIntent === 'football' && this.isSpecificTeamQuery(userMessage)) {
        finalIntent = 'web_search';
      }

      const llmRoute: ClassifierResult = {
        intent: finalIntent,
        requiresTools: typeof parsed?.requiresTools === 'boolean'
          ? parsed.requiresTools
          : TOOL_INTENTS.has(finalIntent),
        confidence: Math.min(0.99, Math.max(0.65, confidence)),
        reason: `llm_classifier:${String(parsed?.reason || 'model_classified')}`,
        classifiedBy: 'llm',
        ruleIntent: ruleRoute.intent,
        ruleReason: ruleRoute.reason,
        classifierIntent: finalIntent,
        classifierReason: String(parsed?.reason || ''),
      };

      this.logger.debug(
        `[Classifier] ${ruleRoute.intent}/${ruleRoute.reason} → ${llmRoute.intent} (conf=${llmRoute.confidence})`,
      );
      return llmRoute;
    } catch (err: any) {
      this.logger.warn(`[Classifier] LLM call failed: ${err?.message || err}`);
      return {
        ...ruleRoute,
        classifiedBy: 'rule_after_llm_fail',
        ruleIntent: ruleRoute.intent,
        ruleReason: ruleRoute.reason,
        classifierReason: err?.message || String(err),
      };
    }
  }

  private isSpecificTeamQuery(userMessage: string): boolean {
    const normalized = normalizeSearchText(userMessage || '').trim();

    const asksWhenTeamPlays =
      /\bda\s+(hom nao|khi nao|luc nao|ngay nao|may gio)\b/.test(normalized) ||
      /\b(hom nao|khi nao|luc nao|ngay nao|may gio)\b.*\bda\b/.test(normalized);
    if (asksWhenTeamPlays) return true;

    const asksSchedule =
      /\blich\s+(thi dau|da)\b/.test(normalized) ||
      /\btran\s+(tiep theo|sap toi|sau)\b/.test(normalized);
    const hasTeamMarker =
      /\bcua\s+[a-z0-9 ]{2,}\b/.test(normalized) ||
      /\b(doi tuyen|clb|fc|club|national team)\b/.test(normalized);

    if (asksSchedule && hasTeamMarker) return true;

    const hasBroadSignal =
      normalized.includes('bong da') ||
      ['world cup', 'fifa', 'ngoai hang anh', 'premier league', 'la liga',
        'bundesliga', 'serie a', 'champions league', 'c1', 'ligue 1',
        'v-league', 'v league'].some(s => normalized.includes(s));

    return asksSchedule && !hasBroadSignal;
  }

  private parseJson(raw: string): Partial<AiIntentRoute> | undefined {
    // Try to parse parsing directly first since structured output formats are clean JSON
    try {
      return JSON.parse(raw);
    } catch {
      // Fallback to regex parser
      const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonText) return undefined;
      try {
        return JSON.parse(jsonText);
      } catch {
        return undefined;
      }
    }
  }

  private normalizeIntent(value: unknown): AiIntent | undefined {
    const intent = String(value || '').trim() as AiIntent;
    return ALLOWED_INTENTS.includes(intent) ? intent : undefined;
  }
}
