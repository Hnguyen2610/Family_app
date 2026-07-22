# AI Reliability Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nang cap FamilyGPT tu mot AI assistant da co skills/tools thanh he thong dang tin cay hon: hieu follow-up theo ngu canh, thao tac dung entity, giai thich ro truoc khi thay doi du lieu, co eval de ngan regression, va co observability du de debug nhanh.

**Architecture:** Giu kien truc `single orchestrator + skill modules + tools`. Bo sung lop `conversation state`, `entity resolver`, `proposal diff`, va `AI eval suite` de model khong phai tu doan moi thu tu text history.

**Tech Stack:** NestJS, Prisma, React/Next frontend, Telegram bot, Groq/Gemini providers, existing Family Knowledge/RAG, existing AI request logs.

---

## Delivery Snapshot (2026-07-09)

Trang thai hien tai cua workstream nay:

- Direct & follow-up conversation state, entity resolver, proposal V2, sanitizer, eval runner, va Telegram/Web proposal parity da hoan thanh.
- Tat ca cac blockers nhu production DB schema, task entity resolution, RAG citations, centralized family scope policy, resolver telemetry, provider fallback, admin debug request logs/eval drafts, va smoke tests deu da hoan thanh.
- Tat ca unit tests, integration tests, va evaluation suite da pas 100% tren local. Chi tiet check-off theo doi tai `2026-07-08-ai-reliability-upgrade-tracker.md`.

## Phase 0. Setup, Schema, And Rollout Safety

**Goal:** Dong bo plan voi schema da doi, migration thuc te, va release checklist de cac phase sau khong bi "xong code nhung chua deploy duoc".

**Primary files:**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*` hoac Supabase SQL rollout tai lieu tuong duong
- `backend/src/modules/ai-agent/ai-request-log.ts`
- `docs/superpowers/plans/2026-07-08-ai-reliability-upgrade-tracker.md`

- [x] Xac nhan schema cuoi cung cho `AiConversationState`, `AiActionProposal`, `AiRequestLog.resolvedFamilyMode`, va cac field telemetry moi.
- [x] Chot cach rollout production: migration Prisma, Supabase SQL, rollback note, va post-deploy validation query.
- [x] Ghi ro field nao bat buoc co o production truoc khi bat cac feature con lai.
- [x] Them checklist verify sau deploy:
  - `AiConversationState` doc duoc ghi/doc.
  - proposal confirm/reject van doc duoc payload cu.
  - request log moi co `resolvedFamilyMode` va `modelChoiceReason`.

**Acceptance criteria:**

- Co mot rollout path ro rang cho production DB, khong con tinh trang plan va tracker khac nhau o phan schema.
- Team co the check nhanh production da san sang cho cac phase telemetry/debug tiep theo.

## Current Gaps

Nhung diem can nang cap tiep theo dua tren cac loi da gap:

- Follow-up chua on dinh: user noi "doi ten su kien Su kien" ngay sau response co list event nhung AI khong map duoc ve dung event.
- LLM con render raw tool/function text khi tool-call format loi.
- Action confirmation chua than thien: card xac nhan chua noi ro se doi cai gi thanh cai gi.
- Query family/private/all-family con de nham context.
- Calendar mutation con phu thuoc nhieu vao model trong cac case title/date/range/follow-up.
- Debug dashboard da co nhung chua du de nhin request nao dung sai vi sao.
- Eval da co routing nhung chua du cho action/follow-up/RAG/Telegram parity.

---

## Phase 1. Conversation State And Entity Linking

**Goal:** Moi response co du metadata de cau sau co the tham chieu lai chinh xac.

- [x] Tao `ai-conversation-state.ts` hoac service tuong duong.
- [x] Luu metadata gan voi assistant message:
  - listed events: `eventId`, `date`, `time`, `title`, `scope`, `familyId`, `rowNumber`
  - listed notes: `noteId`, `title`, `familyId`, `category`, `rowNumber`
  - listed tasks: `taskId`, `title`, `priority`, `rowNumber`
  - last selected family context
  - last action candidates
- [x] Khi CalendarSkill format danh sach event, tra kem hidden metadata cho frontend/backend session.
- [x] Khi user follow-up bang "cai nay", "su kien do", "dong 1", "Su kien", dung metadata gan nhat truoc khi hoi model.
- [x] Neu co nhieu candidates trung title/time, tra ve card chon candidate thay vi doan.
- [x] TTL metadata theo session, vi du 30-60 phut.

**Acceptance criteria:**

- Hoi "hom nay su kien cua toi co gi" roi "doi ten Su kien thanh Photo..." phai resolve ve event dang hien trong response truoc.
- Neu co 2 event trung ten/gio, bot hoi "ban muon sua muc nao" voi 2 lua chon ro rang.

---

## Phase 2. Entity Resolver Layer

**Goal:** Tach logic tim entity khoi model/tool, de moi mutation phai co target ro rang.

- [x] Tao `ai-entity-resolver.ts`.
- [x] Ho tro resolve event bang:
  - event id hidden metadata
  - row number trong response gan nhat
  - title + date + time + scope
  - title gan dung trong ngay/thang dang duoc noi toi
  - family context selected/all-family
- [x] Ho tro resolve note/task tuong tu.
- [x] Mutation `update/delete` bat buoc co entity id hoac candidate list.
- [x] Neu resolver confidence thap, hoi lai user bang cau ngan gon.
- [x] Log resolver result vao request telemetry:
  - `resolverType`
  - `candidateCount`
  - `confidence`
  - `selectedEntityId`

**Acceptance criteria:**

- Khong con update/delete event bang title mo ho neu chua resolve duoc id.
- Dashboard hien duoc vi sao resolver chon entity do.

---

## Phase 3. Human-Friendly Action Proposal V2

**Goal:** Moi thao tac thay doi du lieu phai hien "se lam gi" va "ket qua sau khi lam" ro rang.

- [x] Nang cap proposal payload:
  - `actionType`
  - `targetType`
  - `targetId`
  - `summary`
  - `before`
  - `after`
  - `riskLevel`
  - `expiresAt`
  - `requiresConfirmation`
- [x] Web proposal card hien:
  - "Doi ten su kien"
  - "Tu: Su kien"
  - "Thanh: Photo giay xac nhan thuc tap"
  - ngay/gio/scope/family
- [x] Telegram inline proposal hien noi dung ngan va nut confirm/cancel.
- [x] Confirm endpoint tra ve result sau khi thuc thi de UI thay card thanh "Da cap nhat".
- [x] Reject endpoint cap nhat card thanh "Da huy".
- [x] Fix loi "Khong the cap nhat thao tac" bang error message co ly do that:
  - expired proposal
  - permission denied
  - target not found
  - already executed

**Acceptance criteria:**

- User doc card confirm la biet chinh xac action se thay doi du lieu nao.
- Confirm thanh cong cap nhat UI ngay, khong can refresh.

---

## Phase 4. Calendar Parser And Date Reliability

**Goal:** Calendar la critical path nen can parser deterministic manh hon, model chi ho tro khi cau qua mo ho.

- [x] Chuan hoa parser ngay/gio tieng Viet:
  - hom nay, ngay mai, thu X tuan nay, thu X tuan sau
  - dau/cuoi tuan, dau/cuoi thang
  - tu ngay A den ngay B
  - lap lai hang ngay/hang tuan/hang thang/hang nam
- [x] Date parser phai dung timezone `Asia/Bangkok`.
- [x] Them test cho loi da gap: thu 6 tuan nay/tuan sau, range 11/7-14/7, title co tu "su kien".
- [x] Title extractor khong duoc tu them prefix "Su kien" neu user da noi "tieu de/ten su kien la ...".
- [x] Event creation range phai tao range dung hoac nhieu event dung theo schema hien tai.
- [x] Calendar query "su kien cua toi" phai include private event cua user, va family event theo selected family/all-family.

**Acceptance criteria:**

- Prompt "tao lich ngay 8/7 scope ca nhan voi tieu de Lam giay..." tao title dung 100%.
- Prompt "tu 11/7 den 14/7 Team Building" hien range dung tren calendar.

---

## Phase 5. Context And Family Scope Policy

**Goal:** Giam nham lan giua default-family, family cu the, all-family va private data.

- [x] Viet policy ro:
  - selected family cu the: lay family events + user private events
  - all-family: lay events cua tat ca family user thuoc ve + user private events
  - group Telegram: family theo group + private context cua user gui tin khi can
  - private Telegram: family cua user hoac hoi chon neu user co nhieu family
- [x] Centralize policy vao helper/service, khong rai rac trong skill.
- [x] Moi request log phai co `resolvedFamilyMode`: `single`, `all`, `telegram_group`, `private`.
- [x] Neu prompt co "cua toi", uu tien include private data.
- [x] Neu prompt co "gia dinh X", resolve family X ro rang.

**Acceptance criteria:**

- "hom nay su kien cua toi co gi" khi UI chon all-family phai tra private + all family visible events.
- Khong hoi lai family khi UI da chon all-family, tru khi action mutation can scope cu the.

---

## Phase 6. Tool Call Contract And Sanitizer Hardening

**Goal:** Khong bao gio de raw function/tool text lo ra user.

- [x] Moi tool co schema validation duy nhat, gan voi formatter.
- [x] Tool dispatcher chi execute tool da dang ky trong policy.
- [x] Model output sanitizer chay cho ca web stream, web chat, Telegram.
- [x] Neu phat hien raw tool text:
  - chan output
  - log incident
  - neu co parsed action hop le thi convert thanh proposal
  - neu khong hop le thi hoi lai user
- [x] Them tests cho:
  - `<function=...>`
  - `internetSearch({...})`
  - fenced code tool call
  - malformed JSON tool call

**Acceptance criteria:**

- Khong con case Telegram/web hien raw tool call.
- Sanitizer log duoc request id va skill/model gay leakage.

---

## Phase 7. RAG Answer Quality And Memory Governance

**Goal:** RAG tra dung hon, minh bach hon, va khong tu ghi memory khi user chi hoi.

- [x] RAG response co optional citation noi bo:
  - note title
  - category
  - family
  - snippet ngan
- [x] Khi RAG miss, response phai noi "chua thay trong so tay" thay vi doan.
- [x] Memory write chi tao proposal khi user noi ro "luu/nho/ghi lai".
- [x] Duplicate detection truoc khi tao note moi.
- [x] Neu note gan giong da ton tai, de xuat update/merge thay vi tao duplicate.
- [x] Dashboard hien top RAG misses va top duplicated titles.

**Acceptance criteria:**

- Hoi thong tin da co trong Family Notes phai retrieve note dung.
- Hoi "X thich an gi khong" khong duoc auto luu memory neu user chua cung cap thong tin moi.

---

## Phase 8. AI Evaluation Suite V2

**Goal:** Moi bug AI da fix phai bien thanh eval case de khong lap lai.

- [x] Mo rong `backend/scripts/ai-routing-evals.json` hoac tao `ai-action-evals.json`.
- [x] Them nhom eval:
  - calendar create/update/delete
  - follow-up entity linking
  - family/all-family/private scope
  - RAG Q&A
  - Telegram command/chat parity
  - raw tool leakage
  - weather/football realtime routing
- [x] Moi eval co expected:
  - intent
  - skill
  - actionType
  - target entity/candidate behavior
  - shouldAskClarification
  - shouldUseRag
- [x] Tao script `npm run eval:ai` chay deterministic unit/eval local.
- [x] Feedback "Sai/Sai family/Sai ngay gio" tu UI co the tao eval draft.

**Acceptance criteria:**

- Truoc deploy co the chay eval va thay regression trong cac case da gap.
- Feedback sai co du du lieu de copy thanh eval case.

---

## Phase 9. Model Routing And Cost Control V2

**Goal:** Dung model dung viec, giam latency va giam loi tool-call.

- [x] Dinh nghia model policy theo task:
  - direct parser/action: no model
  - simple chat: fast model
  - risky mutation interpretation: stronger/tool-stable model
  - vision: vision model
  - search summarization: model co kha nang Vietnamese formatting tot
- [x] Log `modelChoiceReason`.
- [x] Neu Groq tool-call fail, fallback khong duoc mat action; phai retry structured parser hoac hoi lai.
- [x] Circuit breaker khi provider loi lien tiep.
- [x] Dashboard latency tach theo:
  - routing
  - resolver
  - RAG
  - model
  - tool
  - formatter

**Acceptance criteria:**

- Cac action ro rang khong ton token model.
- Provider loi khong lam user thay raw error/tool text.

---

## Phase 10. Admin AI Debug Experience

**Goal:** Debug AI nhanh hon bang UI thay vi doc log backend.

- [x] Dashboard request detail hien:
  - original prompt
  - normalized prompt
  - intent route + classifier confidence
  - selected skill
  - selected family mode
  - resolver candidates
  - RAG snippets
  - proposed action
  - confirmed/rejected status
  - model/provider/fallback reason
  - sanitizer incidents
- [x] Them filter:
  - failed only
  - needs clarification
  - raw tool blocked
  - low confidence
  - feedback negative
- [x] Nut "Create eval from request".
- [x] Nut copy debug bundle.

**Acceptance criteria:**

- Mot loi AI co the trace trong dashboard ma khong can grep log.

---

## Phase 11. Telegram/Web Parity

**Goal:** Chat web va Telegram di qua cung behavior, khac nhau chi o transport/UI.

- [x] Dung chung formatter core cho web va Telegram.
- [x] Telegram action proposal button dung cung proposal backend.
- [x] Telegram group mutation phai hien family/scope ro.
- [x] Telegram private chat neu user co nhieu family:
  - query all-family khi la cau hoi doc
  - hoi chon family khi la mutation family-scoped
- [x] Feedback Telegram ghi vao cung feedback/request log.

**Acceptance criteria:**

- Cung mot prompt tren web/Telegram cho cung intent/scope cho ket qua nhat quan.

---

## Phase 12. Verification And Release Gate

- [x] Backend typecheck/build.
- [x] Frontend typecheck/build.
- [x] Prisma validate.
- [x] Unit tests parser/resolver/dispatcher/sanitizer.
- [x] AI eval suite.
- [x] Telegram smoke test:
  - query calendar
  - create proposal
  - confirm proposal
  - feedback button
- [x] Web smoke test:
  - query private events
  - update event from prior response
  - confirm action
  - RAG Q&A
- [x] `git diff --check`.
- [x] `gitnexus detect-changes`.

---

## Remaining Execution Waves

### Wave A. Data Safety And Resolver Telemetry

**Why first:** Day la lop chan regression cho mutation follow-up. Neu chua xong, cac phase sau van kho debug va de sua nham entity.

**Files to focus:**

- `backend/src/modules/ai-agent/services/ai-conversation-state.service.ts`
- `backend/src/modules/ai-agent/ai-entity-resolver.ts`
- `backend/src/modules/ai-agent/ai-structured-action-handler.ts`
- `backend/src/modules/ai-agent/services/ai-agent.service.ts`
- `backend/src/modules/ai-agent/ai-request-log.ts`
- `backend/src/modules/daily-tasks/*` neu can lay task metadata

- [x] Hoan tat `lastShownTasks` persistence va task follow-up references.
- [x] Them resolver telemetry `resolverType`, `candidateCount`, `confidence`, `selectedEntityId`.
- [x] Day telemetry nay vao request log/dashboard payload.
- [x] Hoan tat proposal errors cho duplicate target va permission-specific rejection.

**Wave exit criteria:** Theo doi duoc AI da resolve entity bang cach nao, mutation follow-up co du evidence de debug, va task entities khong bi bo qua khoi conversation state.

### Wave B. Scope Policy And Calendar Query Reliability

**Why second:** Family/private/all-family dang cat ngang query, mutation, va RAG. Neu khong centralize som, cac test sau de false pass.

**Files to focus:**

- `backend/src/modules/ai-agent/ai-family-resolver.ts`
- `backend/src/modules/ai-agent/skills/calendar.skill.ts`
- `backend/src/modules/ai-agent/skills/family-knowledge.skill.ts`
- `backend/src/modules/ai-agent/services/ai-agent.service.ts`
- `backend/src/modules/telegram/services/telegram-ai-responder.service.ts`
- `backend/src/modules/telegram/telegram-formatters.ts`

- [x] Centralize selected-family / all-family / private rules vao mot helper/service.
- [x] Bao dam query "cua toi" include private data trong ca web va Telegram.
- [x] Them tests cho all-family query, private query, va mutation can scope cu the.
- [x] Xac nhan `resolvedFamilyMode` duoc log nhat quan tren moi transport.

**Wave exit criteria:** Cung mot prompt scope-sensitive tren web va Telegram cho cung family mode, cung expectation, va khong hoi lai khong can thiet.

### Wave C. RAG Governance, Provider Fallback, And Admin Debug UX

**Why third:** Sau khi entity va scope da on, day la lop giup team nhin va xu ly nhanh cac loi thuc te con lai.

**Files to focus:**

- `backend/src/modules/ai-agent/skills/family-knowledge.skill.ts`
- `backend/src/modules/ai-agent/services/rag.service.ts`
- `backend/src/modules/ai-agent/ai-model-routing.ts`
- `backend/src/modules/ai-agent/ai-model-handlers.ts`
- `backend/src/modules/ai-agent/ai-request-log.ts`
- `frontend/src/components/admin/AiDashboard.tsx`
- `frontend/src/components/admin/AiDashboardRequestLogs.tsx`
- `frontend/src/components/admin/ai-dashboard-utils.ts`

- [x] Them citation noi bo ro rang cho RAG answers.
- [x] Them duplicate note detection va update/merge proposal path.
- [x] Bao ton structured action khi provider fail: fallback parser/retry/clarification thay vi raw error.
- [x] Mo rong request detail view, filters, `Create eval from request`, va copy debug bundle.

**Wave exit criteria:** Team co the doc mot request log va biet prompt gi vao, route/skill/model nao duoc chon, resolver/RAG/proposal ra sao, va fallback nao da xay ra.

### Wave D. Final Verification And Release Gate

**Why last:** Day la luc khoa chat phan con mo bang test va smoke test gan voi behavior nguoi dung.

**Files to focus:**

- `backend/package.json`
- `frontend/package.json`
- `backend/scripts/eval-ai.ts`
- `docs/superpowers/plans/2026-07-08-ai-reliability-upgrade-tracker.md`

- [x] Chay full backend suite.
- [x] Chay full frontend typecheck/test command neu tach rieng build.
- [x] Chot Telegram/web smoke test script hoac checklist.
- [x] Re-run `git diff --check` va `gitnexus detect-changes` truoc khi dong phase.

**Wave exit criteria:** Con lai chi la deploy/review, khong con unknown gap ve test coverage hoac transport parity.

---

## Recommended Order

1. Phase 0 - Setup, Schema, And Rollout Safety
2. Phase 1 - Conversation State And Entity Linking
3. Phase 2 - Entity Resolver Layer
4. Phase 3 - Human-Friendly Action Proposal V2
5. Phase 4 - Calendar Parser And Date Reliability
6. Phase 5 - Context And Family Scope Policy
7. Phase 6 - Tool Call Contract And Sanitizer Hardening
8. Phase 8 - AI Evaluation Suite V2
9. Phase 7 - RAG Answer Quality And Memory Governance
10. Phase 9 - Model Routing And Cost Control V2
11. Phase 10 - Admin AI Debug Experience
12. Phase 11 - Telegram/Web Parity
13. Phase 12 - Verification And Release Gate

---

## Non-Goals For This Plan

- Khong chuyen sang multi-agent neu chua co workflow can planner/reviewer rieng.
- Khong train/fine-tune model rieng trong phase nay.
- Khong them provider moi neu loi hien tai giai quyet duoc bang routing, validation, resolver va eval.
- Khong mo rong UI lon neu chua co backend metadata/action contract on dinh.
