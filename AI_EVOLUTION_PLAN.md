# AI Evolution Plan - Family App

Muc tieu: nang cap FamilyGPT theo tung buoc nho, uu tien nhung phan co the deploy ngay tren kien truc hien tai: NestJS backend, Vercel cron endpoint, Prisma/Postgres, Web Push, AI skill architecture.

## Nguyen Tac

- Uu tien tinh nang co ich truc tiep cho gia dinh truoc khi them kien truc lon.
- Khong dua multi-agent/MCP vao som neu single agent + skills van du de debug.
- Tat ca tinh nang tu dong can co co che chong spam va ton trong privacy.
- Vision/RAG/memory phai co buoc preview/confirm truoc khi ghi database.
- Tren Vercel, cron nen di qua HTTP endpoint co secret thay vi chi dua vao process scheduler.

## Phase 1 - Proactive Assistant

Muc tieu: AI chu dong nhac va goi y hanh dong dua tren du lieu co san, khong can user mo chat truoc.

- [x] Dung pipeline thong bao hien co: `NotificationsService`, Web Push, in-app notification.
- [x] Dung endpoint cron hien co `/api/notifications/daily` de Vercel Cron co the kich hoat.
- [x] Quet su kien 7 ngay toi va gui goi y chuan bi.
- [x] Uu tien birthday/anniversary/appointment, bo qua thong bao trung voi reminder trong ngay.
- [x] Goi y finance khi chi tieu FOOD thang nay tang manh so voi thang truoc.
- [x] Chong spam bang dedupe notification trong mot khoang ngay.
- [x] Log summary de biet da scan bao nhieu user va gui bao nhieu goi y.

## Phase 2 - Memory UI va Consent

Muc tieu: bien memory thanh phan co the xem/sua/xoa, khong am tham luu thong tin nhay cam.

- [x] Tao UI xem memory profile (`AiMemorySettings.tsx`).
- [x] Cho phep user sua/xoa food likes (Dietary Style), dislikes, health restrictions, family notes.
- [x] Neu AI muon luu memory moi, hoi confirm qua UI consent overlay trong chat.
- [x] Dong bo hoa favorite dishes tu Meals module vao memory context cua AI.
- [x] Them audit metadata: aiMemory.lastUpdatedAt.
- [x] Khong dung RAG cho memory nho va co cau truc.


## Phase 3 - Selective RAG

Muc tieu: dung RAG cho du lieu phi cau truc va dai, khong thay the tool/database query co cau truc.

- [x] Chon use case dau tien: family notes/wiki.
- [x] Tao bang document va document chunks cho family wiki.
- [x] Them retrieval chi cho intent `family_knowledge`.
- [x] Gioi han top-k nho de khong lam tang latency.
- [x] Tra loi co source/ngu canh neu can.
- [x] Nang cap semantic search bang pgvector/embeddings khi database ho tro extension on dinh.
- [x] Auto RAG co dieu kien cho cac cau goi y meal/calendar/horoscope/general khi co tin hieu family notes.
- [x] AI co the de xuat luu thong tin dai vao Family Notes/RAG va chi luu khi user confirm.

## Phase 4 - Advanced Vision

Muc tieu: anh khong chi de hoi dap, ma co the trich xuat du lieu va tao draft hanh dong.

- [x] Ho tro anh trong chat va routing qua Gemini vision.
- [x] Nen anh client-side va hien status anh.
- [x] Tach upload anh rieng bang Cloudinary URL neu base64 JSON cham.
- [x] Receipt/bill extraction: tao draft transaction, chua auto luu giao dich that.
- [x] Medicine/school plan extraction: tao draft note/event/task, chua auto luu su kien that.
- [x] Luu ket qua extraction co schema de skill khac dung lai.
- [x] UI review/confirm draft va save sang Finance/Event neu user dong y.

## Phase 5 - Notification Channels

Muc tieu: day thong bao den noi user that su doc duoc.

- [x] Web Push cho desktop/PWA.
- [x] Cai thien huong dan iOS PWA: phai Add to Home Screen va cho phep notification.
- [x] Telegram bot de nhan thong bao va tuong tac lenh co ban.
- [ ] Zalo/Messenger chi quay lai khi co API chinh thuc phu hop va khong vuong policy/approval.

## Phase 6 - Performance, Cost, Security

Muc tieu: nhanh hon, re hon, an toan hon.

- [x] Exact response cache cho cau hoi lap lai.
- [x] Hybrid model routing Groq/Gemini.
- [x] Usage/context display trong UI.
- [x] Cache theo skill cho cac ket qua it thay doi.
- [x] Rate limit endpoint AI va cron endpoint.
- [x] Redact du lieu nhay cam truoc khi gui provider neu use case yeu cau.
- [x] Them dashboard logs/co ban cho latency, model, cache hit, error.

## Multi-Agent Decision Gate

Chua nen lam multi-agent neu cac dieu kien duoi day chua xuat hien ro:

- Mot request can planner/worker/reviewer doc lap.
- Can chay song song nhieu nguon du lieu lon.
- Single agent + skill routing bat dau kho debug.
- Latency cua workflow nhieu buoc van chap nhan duoc sau khi tach skill.

Hien tai nen tiep tuc voi kien truc: `single orchestrator + skill modules + tools`.
