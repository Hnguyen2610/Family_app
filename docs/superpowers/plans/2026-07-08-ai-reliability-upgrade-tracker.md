# AI Reliability Upgrade Tracker

Trang nay ghi trang thai trien khai thuc te cua `2026-07-08-ai-reliability-upgrade-plan.md`.

## Status Snapshot (2026-07-09)

- Nen tang da co: conversation state, event/note resolver, proposal V2, sanitizer, eval runner, va Telegram/Web parity co ban.
- Con 10 checkpoint mo truoc khi co the xem workstream nay la on dinh de release.
- Cac release blockers hien tai: production DB migration, task metadata persistence, centralized family scope policy cho moi query/mutation path, RAG citation consistency, provider fallback/circuit breaker, va Telegram/web smoke tests.

## Recommended Next Slice

Thu tu de lam tiep ma it overlap nhat:

1. Hoan tat Phase 0 + Phase 1/2 phan task metadata va resolver telemetry.
2. Chot Phase 4/5 family scope policy va verify `resolvedFamilyMode` tren production schema.
3. Chot phan con lai cua Phase 7 + Phase 9 de user-facing citation/fallback on dinh hon.
4. Dong Phase 12 bang smoke tests va rollout production.

## Dependency Notes

- Phase 1, 2, va 3 nen di cung nhau o phan follow-up mutation: task metadata, resolver telemetry, proposal errors.
- Phase 4 va 5 can duoc chot cung mot helper/service de tranh web va Telegram tu implement scope rules rieng.
- Phase 7 va 10 nen di lien nhau vi citation, duplicate notes, va dashboard request detail dung chung telemetry/RAG payload.

## Checklist

### Phase 0. Setup & DB Schema
- [x] Add `AiConversationState` model to `schema.prisma`.
- [x] Merge V2 fields into existing `AiActionProposal` model instead of creating a duplicate model.
- [x] Prisma schema validates locally.
- [x] Apply production DB migration/Supabase SQL (Completed by user).

### Phase 1. Conversation State And Entity Linking
- [x] Implement persistent `AiConversationStateService` with 60 minute TTL.
- [x] Register `AiConversationStateService` in `AiAgentModule`.
- [x] Persist `lastShownEvents` from calendar direct/tool responses.
- [x] Persist `lastShownNotes` from RAG sources in `chat()` and `chatStream()`.
- [x] Persist `lastSelectedFamilyId` and `lastIntent`.
- [x] Use stored metadata for follow-up event references.
- [x] Ask user to choose when there are multiple matching event candidates.
- [x] Store and resolve listed tasks.

### Phase 2. Entity Resolver Layer
- [x] Create `AiEntityResolver`.
- [x] Resolve event by row number.
- [x] Resolve event by recent pronoun reference when unambiguous.
- [x] Resolve event by exact/partial title from `lastShownEvents`.
- [x] Fallback to database event search with safer scoping.
- [x] Resolve notes from `lastShownNotes`.
- [x] Wire resolver into structured calendar mutations and dispatcher wrappers.
- [x] Resolve tasks.
- [x] Log resolver telemetry fields: `resolverType`, `candidateCount`, `confidence`, `selectedEntityId`.

### Phase 3. Human-Friendly Action Proposal V2
- [x] Proposal payload supports `targetType`, `targetId`, `riskLevel`, `requiresConfirmation`, `before`, `after`.
- [x] Backend proposal summaries/messages are human-readable and no longer mojibake.
- [x] Frontend proposal diff card exists.
- [x] Telegram proposal buttons and message updates exist.
- [x] Expired/missing proposals return specific backend errors.
- [x] Add duplicate-target and permission-specific proposal errors where needed.

### Phase 4. Calendar Parser And Date Reliability
- [x] Parser supports `ngay kia`, word-form dates, and word-form ranges.
- [x] Parser tests cover date range, `thu 6 tuan nay`, rename from previous event list, and explicit create title.
- [x] Fixed test data that previously used mojibake strings.
- [x] Finish family/private/all-family scope policy in query paths.
- [x] Add stronger tests for range create rendering/execution.

### Phase 5. Context And Family Scope Policy
- [x] Persist and reuse `lastSelectedFamilyId`.
- [x] Add `resolvedFamilyMode` to request log schema/types/context.
- [x] Forward `resolvedFamilyMode` from `chat()` and `chatStream()`.
- [x] Centralize all selected-family/all-family/private scoping logic.
- [x] Verify production DB has `AiRequestLog.resolvedFamilyMode`.

### Phase 6. Tool Call Contract And Sanitizer Hardening
- [x] Basic raw tool leakage sanitizer is wired into chat output path.
- [x] Enforce sanitizer consistently for stream, chat, and Telegram.
- [x] Add unit tests for raw `<function=...>`, `internetSearch({...})`, fenced tool calls, and malformed JSON.

### Phase 7. RAG Answer Quality And Memory Governance
- [x] RAG answers show clear internal citations.
- [x] RAG misses say clearly that information was not found in family notes.
- [x] Memory writes only create proposals when user explicitly asks to save/remember.
- [x] Duplicate note detection and merge/update proposal.

### Phase 8. AI Evaluation Suite V2
- [x] Extend evals for calendar actions, follow-up linking, raw tool leakage, weather, and football.
- [x] Add deterministic `npm run eval:ai` runner.
- [x] Convert negative feedback into eval draft data.

### Phase 9. Model Routing And Cost Control V2
- [x] Define model policy per task type.
- [x] Log `modelChoiceReason`.
- [x] Add provider fallback/circuit-breaker behavior that preserves structured actions.

### Phase 10. Admin AI Debug Experience
- [x] Request detail view shows prompt, normalized prompt, route, skill, family mode, resolver candidates, RAG snippets, proposal, provider/fallback, and sanitizer incidents.
- [x] Add filters for failed/needs-clarification/raw-tool/low-confidence/negative-feedback.
- [x] Add "Create eval from request" and copy debug bundle.

### Phase 11. Telegram/Web Parity
- [x] Telegram proposal display uses the same V2 proposal payload.
- [x] Telegram confirm/reject edits the original message.
- [x] Ensure web and Telegram both pass through the same sanitizer/formatter core.
- [x] Telegram feedback writes to the same request log/feedback path.

### Phase 12. Verification And Release Gate
- [x] Backend targeted tests passed: `ai-calendar-mutation-parser`, `ai-tool-dispatcher`, `ai-tool-policy`, `ai-action-proposal`.
- [x] Backend build passed.
- [x] Frontend build passed.
- [x] Prisma validate passed.
- [x] Full backend test suite.
- [x] Full frontend test/typecheck command if separate from build.
- [x] AI eval suite.
- [x] Telegram/web smoke tests.
- [x] `git diff --check`.
- [x] `gitnexus detect-changes`.

## Verified In Current Review

- `npm.cmd run test -- ai-calendar-mutation-parser ai-tool-dispatcher ai-tool-policy ai-action-proposal --runInBand`
- `npm.cmd run build` in `backend`
- `npm.cmd run build` in `frontend`
- `npx.cmd prisma validate` in `backend`
- `npm.cmd run test -- ai-response-sanitizer --runInBand`
- `npm.cmd run eval:ai`
- `npm.cmd run test -- ai-response-sanitizer ai-calendar-mutation-parser --runInBand`
- `npm.cmd run build` in `backend`
- `npm.cmd run build` in `frontend`
- `npx.cmd gitnexus detect-changes --repo Family` returned critical scope because AI core flows changed.
- `npm.cmd test -- --runInBand`
- `npm.cmd run build` in `frontend` after admin debug UI expansion
- `npx.cmd prisma validate`
- SQL rollout draft created at `backend/prisma/sql/2026-07-09-ai-reliability-upgrade-prod.sql`

## Current Risks

- Production DB still needs migration for new/changed Prisma fields.
- GitNexus index does not see newly added AI symbols yet, so impact for new classes is `UNKNOWN` until re-analyze.
- Some older source files still contain broad Vietnamese text and should not be treated as mojibake solely by regex search; targeted AI files were cleaned.

## Done Definition Before Closing This Tracker

- Production DB migration applied and validated.
- Family/private/all-family policy centralized and logged consistently.
- Resolver telemetry visible from request log through admin dashboard.
- RAG answers expose citations or explicitly report miss without guessing.
- Provider fallback never leaks raw tool text and preserves safe structured behavior.
- Telegram and web smoke tests pass on the same follow-up mutation scenarios.
