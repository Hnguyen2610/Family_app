# Refactor Plan

Muc tieu: lam codebase gon hon, DRY hon, de maintain hon nhung khong doi behavior hien tai. Neu phase nao can doi logic, dung lai hoi truoc.

## Nguyen Tac

- [ ] Chi refactor cau truc/code organization, khong doi business logic.
- [ ] Moi phase phai build/type-check sau khi lam.
- [ ] Truoc khi sua symbol/function/class phai chay GitNexus impact.
- [ ] Sau moi phase chay `git diff --check` va `gitnexus detect-changes`.
- [ ] Khong gom qua nhieu risk vao mot phase.
- [ ] Neu gap HIGH/CRITICAL impact tu GitNexus thi dung lai bao truoc.

## Phase 1: Common Utilities

- [x] Tao backend time util:
  - `getIctNow`
  - `getIctDateKey`
  - `startOfIctDay`
  - `formatIctDate`
  - constant `ICT_TIME_ZONE`
- [x] Tao backend validation util:
  - `isValidEmail`
- [x] Tach `normalizeSearchText` khoi `ai-intent-router.ts` sang text util rieng.
- [x] Cap nhat imports backend dung util moi.
- [x] Tao frontend format util:
  - `formatCompactNumber`
  - `formatLatency`
  - `formatDateVi`
  - `formatCurrency`
- [x] Cap nhat `chatbot-usage`, `ai-dashboard-utils`, `Finance` dung formatter chung neu phu hop.

## Phase 2: Chatbot Component Cleanup

- [x] Tach `ChatSidebar`.
- [x] Tach `ChatMessageList`.
- [x] Tach `ChatInputBar`.
- [x] Tach `MemoryConsentCard`.
- [x] Tach `RagConsentCard`.
- [x] Tao hook `useChatSessions`.
- [x] Tao hook `useChatStream`.
- [x] Giu `Chatbot.tsx` chi con layout + state orchestration.
- [x] Build frontend.

## Phase 3: Telegram Service Split

- [x] Tach command registration ra `telegram-command-handlers.ts`.
- [x] Tach action/callback handlers ra `telegram-action-handlers.ts`.
- [x] Tach text/photo/document message handlers ra `telegram-message-handlers.ts`.
- [x] Tach send helpers ra `telegram-sender.ts`.
- [x] Giu `TelegramService` chi lam:
  - init bot
  - configure webhook/polling
  - setup handler modules
  - expose notification send methods
- [x] Build backend.

## Phase 4: Notifications Service Split

- [ ] Tach proactive briefing builder ra `proactive-briefing.builder.ts`.
- [ ] Tach cron orchestration ra helper/service neu Nest DI phu hop.
- [ ] Tach finance/weather/event/family-note briefing items thanh helper rieng.
- [ ] Tach notification dedupe helper.
- [ ] Giu `NotificationsService` chi lam:
  - create/read/delete notification
  - call sub-builders/services
  - expose cron entrypoints
- [ ] Build backend.

## Phase 5: AiAgentService Deep Cleanup

- [ ] Tach family resolution ra `ai-family-resolver.ts`.
- [ ] Tach request/session pipeline ra `ai-chat-pipeline.ts`.
- [ ] Tach cache/session history helper ra `ai-session-cache.ts`.
- [ ] Tach structured memory/event shortcut handler ra `ai-structured-action-handler.ts`.
- [ ] Tach request log/usage assembly ra `ai-request-telemetry.ts`.
- [ ] Giu `AiAgentService` la orchestrator mong:
  - classify intent
  - select skill
  - call pipeline/model handler
  - save messages/logs
- [ ] Build backend.

## Phase 6: Calendar UI Cleanup

- [x] Tach `CalendarHeader`.
- [x] Tach `CalendarGrid`.
- [x] Tach `CalendarDayCell`.
- [x] Tach `CalendarDayDetailPanel`.
- [x] Tao hook `useCalendarEvents`.
- [x] Giu `Calendar.tsx` chi con page layout + modal state.
- [x] Build frontend.

## Phase 7: VisionDrafts And Image Utilities

- [ ] Gom image helpers dung chung:
  - `compressImage`
  - `fileToDataUrl`
  - `loadImage`
  - `dataUrlToBlob`
  - `uploadToCloudinary`
  - `optimizeCloudinaryUrl`
- [ ] Cap nhat `VisionDrafts` va `Chatbot` dung chung image util neu phu hop.
- [ ] Tach `DraftCard` va normalizers ra file rieng.
- [ ] Build frontend.

## Phase 8: Final Verification

- [ ] Backend build.
- [ ] Frontend build.
- [ ] `git diff --check`.
- [ ] `gitnexus detect-changes`.
- [ ] Review file size top list.
- [ ] Review nhung behavior can manual smoke test:
  - AI chat web stream
  - Telegram bot commands/chat
  - Calendar create/edit/delete/range
  - Proactive notifications
  - Family notes/RAG
  - Vision drafts upload/read

## Uu Tien De Xuat

1. Phase 1
2. Phase 2
3. Phase 6
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 7
8. Phase 8
