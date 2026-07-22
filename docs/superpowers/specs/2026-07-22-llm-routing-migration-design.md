# LLM Routing Migration — Design Spec

Date: 2026-07-22

## 1. Goal

Replace the keyword/regex-based intent routing and the regex-based "decide the write
action myself" shortcuts with a single mechanism: the LLM's native tool-calling,
given the full set of available tools in one request. The LLM becomes the router —
there is no separate classification step before it, and no code path that decides to
create/update/delete data without the LLM reasoning about the request first.

This directly targets a concrete failure mode already observed in production: the
regex-based calendar-mutation parser (`parseCalendarMutation`) and the memory-event
handler (`tryHandleStructuredMemoryEvent`) sometimes match new/unfamiliar phrasing
confidently and produce the wrong action, with no model reasoning in the loop to catch
it.

## 2. Scope

**In scope:**
- Remove `classifyAiIntent` (`ai-intent-router.ts`) and `AiIntentClassifier`
  (`ai-intent-classifier.ts`) as the mechanism that selects a single skill/intent
  before the model call.
- Remove `AiStructuredActionHandler.tryHandleStructuredCalendarMutation` and
  `tryHandleStructuredMemoryEvent` — both decide a write action (create/update/delete
  event, create a memory proposal) from regex alone, with no model call. Both are the
  same class of risk and are removed together.
- Flatten tool schemas from every registered skill into one list per chat turn, so the
  model chooses the tool itself in a single call (using the existing ReAct/PEV loop
  and LoopGuard for any multi-tool sequences).
- Turn Family Knowledge RAG retrieval into a tool (`searchFamilyNotes`) the model calls
  when it decides it needs family context, instead of always preloading RAG context
  based on a pre-computed intent.
- Repackage the Vietnamese date/time extraction logic currently inside
  `ai-calendar-mutation-parser.ts` as a standalone tool (`resolveVietnameseDate`) the
  model can call to get a reliable date/range instead of computing dates itself.
- Generalize tool execution dispatch to route by tool name (owner-skill lookup)
  instead of "the one skill selected for this intent, then the knowledge skill, then a
  fallback."
- Rewrite the AI eval suite to call the real model and check that it called the
  expected tool, instead of comparing `classifyAiIntent()`'s output to an expected
  intent.
- Write one unified system prompt instead of concatenating each skill's
  `getSystemPrompt()`.

**Out of scope (explicitly unchanged):**
- `CalendarSkill.tryDirectAnswer` — the calendar **read/query** path (e.g. "lịch hôm
  nay có gì") stays exactly as-is. It is read-only, lower risk, very high frequency,
  and the parser it uses (`parseCalendarDate`) is not being removed. Only the
  **write** path (create/update/delete) is being handled by the LLM now.
- The permission gates in `ai-tool-policy.ts` (`shouldAllowSideEffectTool`,
  `shouldAllowKnowledgeOrAutoWrite`, `shouldAllowKnowledgeWriteTool`,
  `shouldAllowGeneralMemoryTools`) — these stay and continue to filter which tools are
  even offered/allowed to run, independent of routing.
- ReAct/PEV loop, `LoopGuard`, response sanitizer, Action Proposal V2, entity
  resolver, conversation state — none of these change; they operate the same way
  once a tool has been chosen, regardless of how it was chosen.
- Individual skill classes (`CalendarSkill`, `MealSkill`, `WeatherSkill`,
  `MarketSkill`, `FootballSkill`, `SearchSkill`, `FamilyKnowledgeSkill`,
  `GeneralChatSkill`, `HoroscopeSkill`) are not merged or deleted. Each keeps owning
  its own tool definitions and `executeTool` implementation.

**Explicitly rejected alternative:** keep the regex parser as a fast pre-check, then
have a second LLM call "verify" its output before executing. Rejected because (a) a
verification call still requires a full model round-trip, so it does not save any
latency/cost over just letting the model decide the action from scratch, and (b) an
LLM asked "is this parse correct?" is measurably more prone to rubber-stamping a wrong
answer than one asked to independently derive the answer — the exact failure mode
this migration is meant to fix would likely survive verification while looking
"checked."

## 3. New architecture

```
Every chat turn:
  1. No classifyAiIntent / getSkillForIntent call.
  2. Collect getAllSkills(), merge every skill's tool schemas via mergeUniqueTools(),
     filtered by the existing policy functions (shouldAllowSideEffectTool,
     shouldAllowKnowledgeOrAutoWrite, etc.) → one flat tool list
     (~14 existing tools + new searchFamilyNotes + new resolveVietnameseDate).
  3. Build one unified system prompt (see §4).
  4. One model call with the full tool list. The model decides whether to answer
     directly, call one tool, or call several tools across turns of the existing
     ReAct loop.
  5. Tool dispatch looks up the owning skill by tool name (a name → skill map built
     from getAllSkills()) instead of trying "the selected skill, then the knowledge
     skill, then a fallback."
```

## 4. Component-level changes

| File | Change |
|---|---|
| `ai-intent-router.ts` | Remove `classifyAiIntent` and the routing logic around it. Keep `normalizeSearchText` (used broadly elsewhere) and the `AiIntent` type, now used only as a post-hoc label for logging (§5), never for routing. |
| `ai-intent-classifier.ts` | Delete. Its only purpose was to resolve low-confidence cases from the rule router; with no rule router, there is nothing for it to back up. |
| `ai-structured-action-handler.ts` | Remove `tryHandleStructuredCalendarMutation` and `tryHandleStructuredMemoryEvent`. |
| `ai-calendar-mutation-parser.ts` | Keep the date/time/range extraction logic; drop the action-inference logic (create vs. update vs. delete). Expose the date logic as the `resolveVietnameseDate(text)` tool. |
| `ai-skill-registry.ts` | Drop `getSkillForIntent` from the request-handling flow (interface `canHandle` may remain for the post-hoc label only). Add `getAllToolOwners(): Map<toolName, AiSkill>`. |
| `ai-tool-dispatcher.ts` | `createSkillToolDispatcher` takes the tool→skill map and dispatches by tool name instead of a single `skill` + optional `knowledgeSkill` fallback chain. |
| `family-knowledge.skill.ts` / `rag.service.ts` | Add `searchFamilyNotes(query)` tool wrapping the existing pgvector + ILIKE retrieval (no new retrieval logic). |
| `ai-agent-prompt.ts` | Replace per-skill prompt concatenation with one unified prompt (§4.1). |
| `ai-agent.service.ts` | Remove the `getSkillForIntent` + `structuredActionHandler.tryHandleStructured*` branches; call the flattened-tool-list flow instead. |
| `ai-request-log.ts`, `AiDashboardRequestLogs.tsx` | `intent` becomes a post-hoc derived label (§5), not a pre-computed routing decision. |
| `backend/scripts/eval-ai.ts`, `ai-action-evals.json` | Rewritten to call the real model and assert on the tool actually invoked (§5). |

### 4.1 Unified system prompt

Do not concatenate all 8 existing `getSystemPrompt()` outputs — that produces a long,
repetitive prompt that can carry conflicting tone/instructions across skills. Instead:

- One fixed core prompt: warm Vietnamese family-assistant persona, and the standing
  rules that apply regardless of topic (always confirm before writing data, how
  proposals work, language/tone).
- Each tool's own `description` field carries its "when to use this" guidance,
  co-located with its schema — this is what tool-calling models read most reliably,
  rather than a separate prose paragraph elsewhere in the prompt.
- Skill-specific persona flavor (e.g. HoroscopeSkill's warm horoscope-expert voice)
  is injected dynamically only when that topic is actually in play (e.g. after the
  model calls a horoscope-related tool, or via a lightweight keyword hint), not loaded
  unconditionally on every turn.

## 5. Observability and eval

- **Request log / dashboard `intent` field:** no longer predicted before the call.
  Derived after the model responds, from which tool (if any) it called — falls back
  to `general_chat` when no tool was called. Display/analytics only; no behavioral
  effect.
- **Eval suite:** `eval-ai.ts` calls the real Groq/Gemini model for each case in
  `ai-action-evals.json` and checks the tool actually invoked against `expectedTool`
  (plus basic arg checks like `title`/`date` where defined). This is slower, costs
  real API tokens per run, and is not perfectly deterministic across runs — accepted
  trade-off. Regressions should be reviewed by a person, not gated on a hard 100%
  pass requirement the way the old deterministic suite was.

## 6. Rollout

Add a temporary env flag `AI_ROUTING_MODE=llm|legacy` defaulting to `llm` once merged.
During the flagged window, the legacy files listed in §4 (`ai-intent-classifier.ts`,
the two `ai-structured-action-handler.ts` methods, `classifyAiIntent`) are **not
deleted yet** — they stay in the codebase, dormant, only reachable when
`AI_ROUTING_MODE=legacy` is set, so there is an immediate in-app rollback path if a
serious regression surfaces against real family data (no redeploy/revert needed).

After roughly 1-2 weeks of stable production behavior on `llm` mode, do a follow-up
cleanup change that deletes the flag and the legacy code path it guards for good.
Until that cleanup lands, §4's "Delete" / "Remove" entries mean "moved behind the
legacy flag," not "deleted from the repo."

## 7. Known risks

- Slightly higher latency per turn: messages that the old rule router could resolve
  instantly (or that the old structured-action handler answered with zero model
  calls) now always cost one full model call with the complete tool list.
- Eval is no longer perfectly deterministic; CI/local runs may show small variance
  run to run.
- `ai-request-log`/dashboard consumers that assumed `intent` was decided *before* the
  model ran now need to treat it as a post-hoc derived label.

## 8. Non-goals

- Not merging skill classes/files into one module — each skill stays a separate,
  independently testable unit.
- Not changing `CalendarSkill.tryDirectAnswer` (read path), permission gates, the
  ReAct/PEV loop, LoopGuard, sanitizer, or Action Proposal V2.
- Not adding a verify-after-parse hybrid for the write path (see §2, rejected
  alternative).
