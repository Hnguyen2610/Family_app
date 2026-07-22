# Family App Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Family App into a more reliable daily family assistant by improving notifications, tasks, calendar ranges, AI confirmations, family profiles, AI evaluation, RAG quality, and future integration readiness.

**Architecture:** Keep the current NestJS + Next.js architecture. Add features incrementally around existing modules instead of replacing the working skill/tool/RAG system. Side-effect actions must go through backend validation and explicit user confirmation where possible.

**Tech Stack:** NestJS, Prisma, PostgreSQL/Supabase, Next.js, React, TypeScript, Telegram Bot API, Web Push, existing AI Skill architecture, existing RAG service.

---

## File Structure

Primary backend areas:

- `backend/prisma/schema.prisma`  
  Adds persistent fields/models for event ranges, notification logs, task snooze/skip/assignee, AI action proposals, member profiles, and AI eval cases.

- `backend/src/modules/events/*`  
  Owns calendar event range creation, querying, formatting, and validation.

- `backend/src/modules/daily-tasks/*`  
  Owns task recurrence, done/snooze/skip, Telegram reminder buttons, and active reminder windows.

- `backend/src/modules/notifications/*`  
  Owns notification delivery history, channel status, and retry/skip visibility.

- `backend/src/modules/ai-agent/*`  
  Owns action proposals, tool-call validation, AI eval logging, routing evaluation, RAG retrieval, and confirmation workflow.

- `backend/src/modules/members/*`  
  Owns user/member profile data used by AI meal/reminder/profile-aware responses.

Primary frontend areas:

- `frontend/src/components/Calendar.tsx` and `frontend/src/components/calendar/*`  
  Shows multi-day events and event range forms.

- `frontend/src/components/DailyTasks.tsx`  
  Shows task assignee, snooze, skip today, next reminder time, done state.

- `frontend/src/components/NotificationDropdown.tsx` and notification settings/admin panels  
  Shows notification history and delivery status.

- `frontend/src/components/Chatbot.tsx` and `frontend/src/components/chatbot/*`  
  Shows AI proposals and confirmation UI before side-effect actions.

- `frontend/src/components/admin/*`  
  Shows AI evaluation dashboard, feedback review, RAG quality, failed tool calls.

- `frontend/src/lib/api-client.ts`  
  Adds typed client methods for new backend endpoints.

---

## Phase 1. Calendar Event Range

**Outcome:** Events can span multiple days with `startDate` and `endDate`. AI and UI no longer store date ranges inside title text.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/events/events.service.ts`
- Modify: `backend/src/modules/events/events.controller.ts`
- Modify: `backend/src/modules/ai-agent/skills/calendar.skill.ts`
- Modify: `frontend/src/components/calendar/CalendarEventModal.tsx`
- Modify: `frontend/src/components/calendar/CalendarDayCell.tsx`
- Modify: `frontend/src/components/calendar/CalendarDayDetailPanel.tsx`
- Modify: `frontend/src/components/Calendar.tsx`
- Modify: `frontend/src/lib/api-client.ts`

- [x] **Step 1: Add schema fields**

Add nullable `endDate` to `Event`. Keep `date` as the existing start date for backwards compatibility.

```prisma
model Event {
  id          String   @id @default(cuid())
  title       String
  description String?
  date        DateTime
  endDate     DateTime?
  time        String?
  type        String
  scope       String
  recurring   String?
  isRecurring Boolean  @default(false)
  familyId    String?
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- [x] **Step 2: Push database schema**

Run:

```bash
cd backend
npm run db:push
```

Expected: Prisma reports database is in sync and generates client.

- [x] **Step 3: Validate event ranges in service**

In `events.service.ts`, normalize `endDate`:

```ts
const start = new Date(eventData.date);
const end = eventData.endDate ? new Date(eventData.endDate) : null;

if (end && end < start) {
  throw new BadRequestException('endDate must be greater than or equal to date');
}
```

- [x] **Step 4: Query events that overlap the requested month**

Replace strict month-only date filtering with overlap filtering:

```ts
where: {
  OR: [
    { date: { gte: monthStart, lte: monthEnd } },
    {
      date: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
  ],
}
```

- [x] **Step 5: Update CalendarSkill createEvent args**

Allow `endDate`:

```ts
endDate: {
  type: 'string',
  description: 'Optional end date in YYYY-MM-DD for multi-day events.',
}
```

Backend rule: title must not include phrases like `đến ngày`, `from`, `to`, or date range suffix if `endDate` exists.

- [x] **Step 6: Add range picker UI**

In `CalendarEventModal.tsx`, expose start date and optional end date using existing date input style:

```tsx
<DateTextInput value={form.date} onChange={(date) => setForm({ ...form, date })} />
<DateTextInput value={form.endDate || ''} onChange={(endDate) => setForm({ ...form, endDate })} />
```

- [x] **Step 7: Render range events across days**

In calendar day mapping, include event when:

```ts
const eventStart = startOfDay(new Date(event.date));
const eventEnd = startOfDay(new Date(event.endDate || event.date));
const current = startOfDay(day.date);
return current >= eventStart && current <= eventEnd;
```

- [x] **Step 8: Verify**

Run:

```bash
cd backend
npm run build
cd ../frontend
npm run build
```

Manual check:

- Create event from 11/7 to 14/7.
- Calendar shows it on 11, 12, 13, 14.
- Title remains `Team Building`, not `đến ngày 14/7 Team Building`.

---

## Phase 2. AI Action Confirmation

**Outcome:** AI proposes side-effect actions before writing data. User confirms on Web or Telegram.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/ai-agent/services/ai-action-proposal.service.ts`
- Modify: `backend/src/modules/ai-agent/ai-agent.module.ts`
- Modify: `backend/src/modules/ai-agent/ai-agent.controller.ts`
- Modify: `backend/src/modules/ai-agent/services/ai-agent.service.ts`
- Modify: `backend/src/modules/telegram/telegram.service.ts`
- Modify: `frontend/src/components/chatbot/*`
- Modify: `frontend/src/lib/api-client.ts`

- [x] **Step 1: Add proposal model**

```prisma
model AiActionProposal {
  id        String   @id @default(cuid())
  userId    String
  familyId  String?
  source    String
  action    String
  payload   Json
  status    String   @default("PENDING")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  expiresAt DateTime
}
```

- [x] **Step 2: Add proposal service**

Create `ai-action-proposal.service.ts` with:

```ts
createProposal(input: {
  userId: string;
  familyId?: string;
  source: 'web' | 'telegram';
  action: 'create_event' | 'update_event' | 'delete_event' | 'create_task' | 'save_note';
  payload: Record<string, unknown>;
}): Promise<AiActionProposal>
```

- [x] **Step 3: Change AI side-effect tools to return proposal**

For side-effect actions, return:

```ts
{
  type: 'action_proposal',
  proposalId,
  action,
  payload,
  message: 'Mình đã chuẩn bị thao tác này. Bạn xác nhận trước khi lưu nhé.'
}
```

- [x] **Step 4: Add confirm endpoint**

In `ai-agent.controller.ts`:

```ts
@Post('proposals/:id/confirm')
confirmProposal(@Param('id') id: string, @Body('userId') userId: string) {
  return this.proposalService.confirm(id, userId);
}
```

- [x] **Step 5: Add reject endpoint**

```ts
@Post('proposals/:id/reject')
rejectProposal(@Param('id') id: string, @Body('userId') userId: string) {
  return this.proposalService.reject(id, userId);
}
```

- [x] **Step 6: Telegram inline buttons**

When Telegram receives `action_proposal`, send buttons:

```ts
[
  [{ text: 'Xác nhận', callback_data: `proposal_confirm:${proposalId}` }],
  [{ text: 'Hủy', callback_data: `proposal_reject:${proposalId}` }],
]
```

- [x] **Step 7: Web proposal card**

In chat UI show:

```tsx
<ActionProposalCard proposal={proposal} onConfirm={confirmProposal} onReject={rejectProposal} />
```

- [x] **Step 8: Verify**

Manual check:

- Ask AI to create event.
- Event is not created before confirmation.
- Confirm creates event.
- Reject does not create event.
- Telegram and Web both work.

---

## Phase 3. Daily Tasks 2.0

**Outcome:** Daily tasks support repeat weekdays, per-task active time range, deterministic next reminder time, and Done actions on UI/Telegram.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/daily-tasks/daily-tasks.service.ts`
- Modify: `frontend/src/components/DailyTasks.tsx`
- Modify: `frontend/src/lib/api-client.ts`

- [x] **Step 1: Add task fields**

```prisma
model DailyTask {
  id                String   @id @default(cuid())
  userId            String
  title             String
  intervalMinutes   Int
  priority          Int      @default(1)
  repeatWeekdays    Json?
  activeStartTime   String?
  activeEndTime     String?
  nextReminderAt    DateTime?
  lastNotifiedAt    DateTime?
  completedAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

- [x] **Step 2: Extend create/update/done APIs**

```ts
create/update accept repeatWeekdays, activeStartTime, activeEndTime.
completeToday clears nextReminderAt for the rest of the day.
```

- [x] **Step 3: Calculate next reminder deterministically**

Use the task active window start as the first reminder of the day. If interval is `30` and active start is `08:00`, reminders are `08:00`, `08:30`, `09:00`, not arbitrary cron times.

```ts
const next = alignToIntervalFromStart(now, activeStart, intervalMinutes);
```

- [x] **Step 4: Keep Telegram Done button**

Reminder message buttons:

```ts
[
  [{ text: 'Done', callback_data: `daily_done:${taskId}` }],
]
```

- [x] **Step 5: Update UI**

Show:

- task title
- interval
- repeat weekdays
- active time range
- next reminder time
- done today

- [x] **Step 6: Verify**

Checks:

- `npm.cmd test -- daily-tasks.service.spec.ts`
- `npm.cmd run build` in `backend`
- `npm.cmd run type-check` in `frontend`
- Done stops reminders for today.
- Repeat weekdays and active time range are editable on the UI.

---

## Phase 4. Notification Center And Delivery Logs

**Outcome:** Every notification has visible delivery history by channel and reason.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/notifications/notification-log.service.ts`
- Modify: `backend/src/modules/notifications/notifications.service.ts`
- Modify: `backend/src/modules/notifications/notifications.controller.ts`
- Modify: `frontend/src/components/NotificationDropdown.tsx`
- Modify: `frontend/src/components/NotificationSettings.tsx`
- Modify: `frontend/src/lib/api-client.ts`

- [x] **Step 1: Add notification log model**

```prisma
model NotificationDeliveryLog {
  id           String   @id @default(cuid())
  userId       String?
  familyId     String?
  type         String
  channel      String
  status       String
  title        String
  body         String
  metadata     Json?
  errorMessage String?
  createdAt    DateTime @default(now())
}
```

- [x] **Step 2: Log every delivery attempt**

Wrap each channel send with:

```ts
await notificationLog.record({
  userId,
  familyId,
  type,
  channel: 'telegram',
  status: result.ok ? 'SENT' : 'FAILED',
  title,
  body,
  errorMessage: result.ok ? undefined : result.error,
});
```

- [x] **Step 3: Add list endpoint**

```ts
@Get('delivery-logs')
findDeliveryLogs(@Query('userId') userId: string, @Query('limit') limit = '50') {}
```

- [x] **Step 4: Show in UI**

Notification dropdown should show status badges:

- `Đã gửi`
- `Lỗi`
- `Bỏ qua`
- `Đã hoàn thành`

- [x] **Step 5: Verify**

Manual check:

- Trigger daily task reminder.
- Delivery log appears.
- Telegram failure records an error.
- In-app notification records success.

---

## Phase 5. Family And Member Profiles

**Outcome:** AI can use explicit member profiles for meals, reminders, and family advice without guessing from chat history.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/members/*`
- Modify: `backend/src/modules/ai-agent/ai-memory-profile.ts`
- Modify: `backend/src/modules/ai-agent/services/family-context-resolver.service.ts`
- Modify: `frontend/src/components/FamilyMembers.tsx`
- Modify: `frontend/src/components/MealPreferenceModal.tsx`
- Modify: `frontend/src/components/AiMemorySettings.tsx`

- [x] **Step 1: Add member profile fields**

```prisma
model User {
  id                   String   @id @default(cuid())
  foodLikes            Json?
  foodDislikes         Json?
  healthRestrictions   Json?
  dailyRoutine         Json?
  notificationPrefs    Json?
  aiProfileNotes       String?
}
```

- [x] **Step 2: Add profile update endpoint**

```ts
@Patch(':id/profile')
updateProfile(@Param('id') id: string, @Body() dto: UpdateMemberProfileDto) {}
```

- [x] **Step 3: Load profiles into AI context**

In family context resolver, include profile only when question intent needs it:

- meals
- reminder planning
- family knowledge
- personal horoscope/profile questions

- [x] **Step 4: UI profile editor**

In member detail, expose:

- likes
- dislikes
- allergies/restrictions
- routine
- AI notes

- [x] **Step 5: Verify**

Manual check:

- Add `không ăn hành` to a member.
- Ask meal suggestion.
- AI avoids onion without needing new chat context.

---

## Phase 6. AI Evaluation Dashboard

**Outcome:** Wrong AI answers become reusable eval cases. Routing/tool/RAG regressions can be tested before deploy.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/ai-agent/services/ai-observability.service.ts`
- Modify: `backend/src/modules/ai-agent/ai-agent.controller.ts`
- Create: `backend/scripts/eval-ai-quality.ts`
- Modify: `frontend/src/components/admin/AiDashboard.tsx`
- Modify: `frontend/src/components/admin/AiDashboardRequestLogs.tsx`

- [x] **Step 1: Add eval model**

```prisma
model AiEvalCase {
  id             String   @id @default(cuid())
  input          String
  expectedIntent String?
  expectedSkill  String?
  expectedAnswer String?
  expectedTool   String?
  sourceLogId    String?
  status         String   @default("ACTIVE")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [x] **Step 2: Create eval from feedback**

When user marks feedback as wrong, create an eval draft from the request log.

- [x] **Step 3: Add eval runner**

Script:

```bash
cd backend
npx ts-node scripts/eval-ai-quality.ts
```

Expected output:

```text
PASS 12
FAIL 2
```

- [x] **Step 4: Dashboard UI**

Admin can:

- create eval from log
- mark expected intent/skill
- run local eval command manually
- see latest pass/fail snapshot

- [x] **Step 5: Verify**

Add eval:

```text
lịch thi đấu tiếp theo của argentina là hôm nào
```

Expected:

```text
intent=football
skill=FootballSkill
```

---

## Phase 7. RAG Quality Upgrade

**Outcome:** Family Notes/RAG becomes easier to trust, edit, deduplicate, and debug.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/ai-agent/services/rag.service.ts`
- Modify: `backend/src/modules/ai-agent/skills/family-knowledge.skill.ts`
- Modify: `frontend/src/components/FamilyNotes.tsx`
- Modify: `frontend/src/components/admin/AiDashboardRequestLogs.tsx`

- [x] **Step 1: Add note version model**

```prisma
model FamilyKnowledgeVersion {
  id          String   @id @default(cuid())
  documentId  String
  title       String
  content     String
  category    String?
  createdBy   String?
  createdAt   DateTime @default(now())
}
```

- [x] **Step 2: Save version before update**

Before note update/delete, insert previous content into `FamilyKnowledgeVersion`.

- [x] **Step 3: Add duplicate detection**

When saving note, compare normalized title and first content chunk. If duplicate, return:

```ts
{
  duplicate: true,
  existingDocumentId,
  message: 'Ghi chú này có vẻ đã tồn tại.'
}
```

- [x] **Step 4: Improve RAG miss diagnostics**

Store:

- query
- normalized query
- familyId
- retrieved count
- top scores if embedding exists later
- reason: no documents, low relevance, wrong family

- [x] **Step 5: Verify**

Manual check:

- Edit note.
- Version history exists.
- Duplicate note is detected.
- RAG miss shows useful reason in AI dashboard.

---

## Phase 8. MCP And External Integrations Readiness

**Outcome:** Prepare integration architecture without prematurely replacing existing tools.

**Files:**
- Create: `docs/integrations/mcp-roadmap.md`
- Create: `backend/src/modules/integrations/integration-tool.interface.ts`
- Optional create later: `backend/src/modules/mcp/*`

- [x] **Step 1: Write MCP decision doc**

Document two roles:

```text
Family App as MCP client: uses outside tools.
Family App as MCP server: exposes Family App tools to outside AI clients.
```

- [x] **Step 2: Define internal integration interface**

```ts
export interface IntegrationTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, context: { userId: string; familyId?: string }): Promise<unknown>;
}
```

- [x] **Step 3: Map existing tools**

Document mappings:

- Calendar tools
- Daily task tools
- Family Notes/RAG tools
- Weather tools
- Notification tools

- [x] **Step 4: Defer MCP server implementation**

Do not implement MCP runtime until:

- internal tool contracts are stable
- side-effect confirmation exists
- auth boundaries are clear

- [x] **Step 5: Verify**

Review doc answers:

- Which tools are read-only?
- Which tools mutate data?
- What auth is required?
- Which clients can use it?

---

## Phase 9. Final Verification Before Release

- [x] **Step 1: Run backend checks**

```bash
cd backend
npm run build
```

- [x] **Step 2: Run frontend checks**

```bash
cd frontend
npm run build
```

- [x] **Step 3: Run Prisma validation**

```bash
cd backend
npx prisma validate
```

- [x] **Step 4: Run Git diff check**

```bash
git diff --check
```

- [x] **Step 5: Run GitNexus detect changes**

```bash
npx gitnexus detect-changes --repo Family --scope all
```

- [x] **Step 6: Manual smoke test**

Check:

- Login
- Calendar create/edit/delete/range
- AI chat create event proposal
- Telegram confirm/reject action
- Daily task reminder, done, snooze, skip
- Notification dropdown
- Family Notes save/edit/search
- AI dashboard logs and eval cases

---

## Recommended Implementation Order

1. Phase 1: Calendar Event Range
2. Phase 2: AI Action Confirmation
3. Phase 3: Daily Tasks 2.0
4. Phase 4: Notification Center And Delivery Logs
5. Phase 5: Family And Member Profiles
6. Phase 6: AI Evaluation Dashboard
7. Phase 7: RAG Quality Upgrade
8. Phase 8: MCP And External Integrations Readiness
9. Phase 9: Final Verification Before Release

Do not start MCP runtime before Phase 2 is complete. Side-effect confirmation is required before exposing Family App tools to external AI clients.
