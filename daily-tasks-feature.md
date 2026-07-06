# Daily Task Manager

## Goal
Thêm tính năng quản lý công việc hằng ngày. Mỗi task có thứ tự ưu tiên và khoảng thời gian giữa các lần nhắc (người dùng tự nhập số phút bất kỳ, ví dụ: 20p, 45p, 90p,...). Cron-job.org poll mỗi 15 phút, backend tự tính task nào đủ điều kiện rồi gửi Telegram. Chỉ hoạt động trong giờ làm việc (8:00–12:00 và 14:00–17:00 ICT).

---

## Thiết kế Logic Trigger

```
Mỗi 30 phút, cron-job.org → GET /api/daily-tasks/trigger-next?userId=...
  1. Nếu ngoài giờ làm việc → dừng, không làm gì.
  2. Lọc task: isActive=true
  3. Điều kiện đủ lượt:
       - lastNotifiedAt IS NULL  (chưa nhắc lần nào hôm nay)
       - HOẶC (now - lastNotifiedAt) >= intervalMinutes
  4. Chọn task có priority thấp nhất (ưu tiên cao nhất) trong số đủ điều kiện.
  5. Gửi Telegram → update lastNotifiedAt = now().
  6. Reset lastNotifiedAt = NULL mỗi ngày lúc 00:00.
```

**Ví dụ:**
| Task | Priority | Interval | Kết quả |
|------|----------|----------|---------|
| Kiểm tra email | 1 | 30p | Nhắc mỗi 30p |
| Review code | 2 | 60p | Nhắc mỗi 1h |
| Báo cáo tuần | 3 | 120p | Nhắc mỗi 2h |

---

## Phase 1: Database

- [x] Thêm model `DailyTask` vào `schema.prisma`:

  ```prisma
  model DailyTask {
    id              String    @id @default(cuid())
    userId          String
    title           String
    priority        Int       @default(0)    // 0 = cao nhất, tăng dần = thấp hơn
    intervalMinutes Int       @default(30)   // số phút bất kỳ, người dùng tự nhập
    isActive        Boolean   @default(true)
    lastNotifiedAt  DateTime?
    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt
    user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  ```

- [x] Thêm `dailyTasks DailyTask[]` vào model `User`.
- [x] `npx prisma migrate dev --name add-daily-tasks` (Đã cập nhật trực tiếp qua Supabase và chạy generate thành công)
  → Verify: Bảng `DailyTask` xuất hiện trong DB.

---

## Phase 2: Backend Module

- [x] Tạo `backend/src/modules/daily-tasks/` với:
  - `daily-tasks.module.ts`
  - `daily-tasks.service.ts`
  - `daily-tasks.controller.ts`

- [x] CRUD API:
  - `GET /api/daily-tasks?userId=` — danh sách, sort `priority ASC`
  - `POST /api/daily-tasks` — tạo `{ userId, title, priority, intervalMinutes }`
  - `PATCH /api/daily-tasks/:id` — cập nhật bất kỳ field
  - `PATCH /api/daily-tasks/reorder` — nhận `[{ id, priority }]`, cập nhật hàng loạt
  - `DELETE /api/daily-tasks/:id` — xóa

- [x] Trigger endpoint (bảo vệ bởi `CRON_SECRET`):
  `GET /api/daily-tasks/trigger-next?userId=`
  ```typescript
  // Logic trong daily-tasks.service.ts:
  const ACTIVE_HOURS = [{ start: 8, end: 12 }, { start: 14, end: 17 }];
  
  function isActiveHour(now: Date): boolean {
    const h = now.getHours(); // ICT
    return ACTIVE_HOURS.some(r => h >= r.start && h < r.end);
  }
  
  // Query task đủ điều kiện:
  const eligible = await prisma.dailyTask.findFirst({
    where: {
      userId,
      isActive: true,
      OR: [
        { lastNotifiedAt: null },
        { lastNotifiedAt: { lte: new Date(Date.now() - task.intervalMinutes * 60_000) } }
      ]
    },
    orderBy: { priority: 'asc' }
  });
  ```

- [x] Reset hàng ngày: thêm cron endpoint `GET /api/daily-tasks/reset-daily?userId=`
  → Set `lastNotifiedAt = null` cho toàn bộ task của user.
  → Thêm 1 job lúc **00:05 ICT** trên cron-job.org.

- [x] Tái sử dụng `TelegramSender` để gửi tin:
  ```
  🔔 Nhắc việc: Kiểm tra email
  ⏱ Nhắc lại sau: 30 phút
  ✅ Hoàn thành: /done_<taskId>
  ```

- [x] Đăng ký module vào `app.module.ts`.
- [x] `npm run build`
  → Verify: Build thành công.

---

## Phase 3: Frontend (Web UI)

- [x] Cài thư viện kéo thả: `npm install @dnd-kit/core @dnd-kit/sortable`
- [x] Tạo `frontend/src/components/DailyTasks.tsx`:
  - Danh sách task, **kéo thả** để đổi priority.
  - Inline input thêm task mới.
  - Mỗi task có `<input type="number" min="1">` để nhập số phút tùy ý (ví dụ: 20, 45, 90). Hiển thị text phụ "phút" kế bên.
  - Toggle `isActive` (bật/tắt nhắc).
  - Nút xóa.
- [x] Thêm tab điều hướng (vào `app/[[...slug]]/page.tsx`).
- [x] Thêm `dailyTasksAPI` vào `api-client.ts`.

---

## Phase 4: Cài Cron trên cron-job.org

- [ ] Deploy backend lên Vercel.
- [ ] Tạo 2 job trên [cron-job.org](https://cron-job.org/) (miễn phí):

  | Job | URL | Lịch |
  |-----|-----|------|
  | Trigger next task | `/api/daily-tasks/trigger-next?userId=<id>` | `*/5 * * * *` |
  | Reset hàng ngày | `/api/daily-tasks/reset-daily?userId=<id>` | `5 17 * * *` (00:05 ICT = 17:05 UTC) |

  Header cho cả 2: `Authorization: Bearer <CRON_SECRET>`

- [ ] Bấm "Run now" để test thủ công.
  > ⚠️ Độ chính xác tối đa của interval phụ thuộc chu kỳ poll (15 phút). Interval ngắn hơn 15 phút không đảm bảo chính xác tuyệt đối, nhưng vẫn hoạt động (delay ≤ 15 phút).
  → Verify: Nhận tin nhắn Telegram.

---

## Done When
- [ ] Thêm/sửa/xóa/kéo thả task được qua Web UI.
- [ ] Mỗi task có thể chọn interval: 30p / 1h / 2h.
- [ ] Chỉ nhận thông báo trong 8:00–12:00 và 14:00–17:00 ICT.
- [ ] Đúng task ưu tiên cao nhất được nhắc trước.
- [ ] Sau 00:00, danh sách reset và bắt đầu lại từ đầu.
- [ ] Build backend + frontend đều OK.

---

## Notes
- `CRON_SECRET` tái sử dụng từ `.env` hiện tại.
- `TelegramSender` tái sử dụng từ `backend/src/modules/telegram/services/`.
- Nếu user chưa liên kết Telegram (`telegramChatId = null`) → log warning, bỏ qua.
- Mỗi user (userId) cần tạo job riêng trên cron-job.org nếu muốn nhận thông báo cá nhân.
