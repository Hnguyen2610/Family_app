# Weekly Horoscope — Show Real Content In-App — Design

## Goal

The in-app "🔮 Tử vi tuần mới" notification currently shows a hardcoded generic placeholder message and links to `/settings`, regardless of what the AI actually generated. The real, personalized horoscope text is only ever delivered via Email and Telegram. Users opening the notification detail in-app never see the actual content. This design makes the in-app notification show the real, personalized horoscope text.

## Background

`sendWeeklyHoroscope()` (`backend/src/modules/notifications/notifications.service.ts:94-167`) already generates the full horoscope via `HoroscopeService.generateWeeklyHoroscope()` (`backend/src/modules/ai-agent/services/horoscope.service.ts:44-82`). Per that service's system prompt, the model is instructed to return **HTML** (`<b>` for headings, `<p>` for paragraphs, 6 fixed sections — no markdown). This `horoscope` string is:
- Emailed via `mailService.sendHoroscopeEmail(...)` (line 143)
- Sent to Telegram, HTML-stripped via `cleanHtmlForTelegram()` (lines 154-156)
- **Not** included in the in-app notification. The `createNotification(...)` call (lines 146-151) hardcodes `message` to a generic teaser and sets `metadata: { path: '/settings' }`, which is what the current UI (`DailySummaryModal`, added in commit `662384b`) renders.

`DailySummaryModal` (`frontend/src/components/DailySummaryModal.tsx`) is a generic "daily brief" modal reused for every notification type — it has sections for weather, today's schedule/tasks, meal suggestions, and an "Ask AI about today" button, none of which are relevant to a horoscope. `NotificationDropdown.tsx` currently renders `DailySummaryModal` unconditionally for every `selectedNotification` (lines 240-251).

The frontend already has `@tailwindcss/typography` available and in use (`prose` classes in `frontend/src/components/chatbot/ChatMessageList.tsx:297`), which can style raw `<b>`/`<p>` HTML without new custom CSS.

## Architecture

- **Backend**: store the full horoscope HTML on the notification itself, alongside the existing short teaser, so the list preview stays unchanged and the detail view has the full content available.
- **Frontend**: add a dedicated `HoroscopeModal` component instead of overloading `DailySummaryModal`, and dispatch on notification type in `NotificationDropdown`.

## Detailed changes

**`backend/src/modules/notifications/notifications.service.ts`** (`sendWeeklyHoroscope`, lines 146-151)
- Change the `createNotification` call's `metadata` from `{ path: '/settings' }` to `{ fullContent: horoscope }`.
- `title` and `message` (the teaser) are unchanged — the list-view preview in `NotificationDropdown` keeps showing the short teaser, not raw HTML.

**`frontend/src/components/HoroscopeModal.tsx`** (new)
- Props mirror `DailySummaryModal`: `isOpen`, `onClose`, `notification`, `language`.
- Renders via `createPortal`, same overlay/backdrop pattern as `DailySummaryModal`, but a simpler card:
  - Header: 🔮 icon, `notification.title`, formatted timestamp.
  - Body: `notification.metadata?.fullContent ?? notification.message` (fallback for notifications created before this change, or if generation failed and only an error string was produced), rendered inside a scrollable container with `dangerouslySetInnerHTML` wrapped in `className="prose prose-sm dark:prose-invert max-w-none"`. Content originates from our own `HoroscopeService` (Gemini call server-side), not user input, so this is safe.
  - Footer: single "Đóng" button only (per user decision — no navigation action needed since content is fully shown inline).

**`frontend/src/components/NotificationDropdown.tsx`**
- Import `HoroscopeModal`.
- Replace the single unconditional `<DailySummaryModal ... />` block (lines 240-251) with a type check: `selectedNotification.type === 'HOROSCOPE'` → render `<HoroscopeModal />`, else → render `<DailySummaryModal />` (existing behavior, unchanged for all other notification types).
- `markAsRead`/`setSelectedNotification` logic in `NotificationItem` is untouched — it already fires before either modal opens.

## Non-goals

- No change to Email or Telegram delivery of the horoscope.
- No change to how other notification types (`BIRTHDAY`, `MEAL_ADDED`, daily/monthly summaries, etc.) render — they keep using `DailySummaryModal` exactly as today.
- No backfill of old `HOROSCOPE` notifications already in the database — they fall back to showing their teaser `message` via the fallback above.
- Not addressing the separate "app appears to be running a stale build" issue raised earlier in the conversation (the old modal UI seen in the user's screenshot, pre-`662384b`) — that's a deploy/cache concern, not something this change fixes.

## Risks

- **`dangerouslySetInnerHTML` with AI-generated content**: content comes from Gemini via our own server-side prompt (not user-supplied), and the prompt instructs plain `<b>`/`<p>` only — low risk, but if the model ever returns unexpected markup (e.g. a stray `<script>`), it would render as-is. Accepted as low-risk given the trusted, single-purpose generation path; no sanitization library is introduced for this narrow case.
- **Legacy notifications**: existing `HOROSCOPE` rows in the DB have `metadata: { path: '/settings' }` with no `fullContent`. The fallback to `message` handles this gracefully (shows the teaser instead of a blank modal) but those old notifications will never show full historical horoscope text — acceptable since horoscopes are weekly and time-sensitive.

## Testing

No existing automated tests cover notification UI. Verification plan:
- Seed one `HOROSCOPE` notification with a realistic `metadata.fullContent` HTML string (via Prisma Studio or a small script) and one legacy-style row without `fullContent`.
- Run the frontend dev server, open the notification dropdown, click each: confirm `HoroscopeModal` renders full content (with fallback for the legacy row), closes correctly, and `isRead` still flips on open.
- Confirm other notification types still open `DailySummaryModal` unchanged.
- Check dark mode rendering of the `prose` content.
- Run `next lint` and `tsc --noEmit` on the frontend, and the backend's existing build/typecheck.
