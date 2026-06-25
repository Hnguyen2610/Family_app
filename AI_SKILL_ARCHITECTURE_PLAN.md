# AI Skill Architecture Plan

Muc tieu: bien AI hien tai tu mot service trung tam qua lon thanh kien truc `single agent orchestrator + skill modules + tools`, giu latency tot va tranh multi-agent khi chua can.

## Dinh Huong

- [x] Giu `AiAgentService` la orchestrator mong.
- [x] Moi domain AI duoc tach thanh mot skill module doc lap.
- [x] Skill module tu quyet dinh:
  - intent nao minh xu ly
  - can family context hay khong
  - can tool-first hay goi model
  - prompt/tool nao duoc bat
  - formatter tra loi truc tiep
- [x] Chua lam multi-agent o phase nay.
- [x] Chi can xem xet multi-agent khi co workflow nhieu buoc phuc tap, can planner/reviewer/worker rieng.

## 1. Skill Contract

- [x] Tao interface chung cho skill, vi du `AiSkill`.
- [x] Moi skill can co:
  - `name`
  - `canHandle(intent)`
  - `getPromptContext()`
  - `getTools()`
  - `tryDirectAnswer()`
  - `formatToolResult()`
- [x] Dinh nghia input/output chung:
  - user message
  - familyId
  - userId
  - intent route
  - family/memory context
  - trace id
- [x] Dinh nghia cach skill bao ve side effect, nhat la tao/sua/xoa event.

## 2. Skill Registry

- [x] Tao `ai-skill-registry.ts`.
- [x] Registry nhan `intentRoute` va tra ve skill phu hop.
- [x] Neu khong co skill phu hop, fallback ve `GeneralChatSkill`.
- [x] Log skill duoc chon vao observability.
- [x] Dam bao moi request chi chon mot primary skill de tranh orchestration phuc tap.

## 3. Calendar Skill

- [x] Tach calendar prompt/rules ra `calendar.skill.ts`.
- [x] Gom cac tools:
  - `getEventsByMonth`
  - `createEvent`
  - `updateEvent`
  - `deleteEvent`
  - `getSolarDateFromLunar`
- [x] Giu tool-first cho query lich thang ro rang.
- [x] Event mutation van di qua model/tool de hieu title/date/scope.
- [x] Them guard de khong tao event neu user chi hoi thong tin.
- [x] Them formatter cho danh sach su kien ngan gon.
- [ ] Test cac case:
  - "lich thang nay"
  - "thang sau co su kien gi"
  - "them sinh nhat me ngay..."
  - "xoa su kien..."
  - ngay am / gio / lap lai

## 4. Meal Skill

- [x] Tach meal prompt/rules ra `meal.skill.ts`.
- [x] Gom tool `generateFamilyMenu`.
- [x] Su dung memory profile:
  - mon thich
  - mon khong thich
  - han che suc khoe
  - ghi chu gia dinh
- [x] Giu tool-first cho cau "hom nay an gi", "goi y thuc don".
- [ ] Sau nay co the them meal history retrieval.
- [ ] Test:
  - goi y menu nhanh
  - tranh mon user khong thich
  - ton trong health restrictions

## 5. Market Skill

- [x] Tach gold/market logic ra `market.skill.ts`.
- [x] Gom tool/API `getGoldPrice`.
- [x] Giu direct formatter, khong goi model khi ket qua da du ro.
- [ ] Chuan bi mo rong cho ty gia / crypto / stock neu can.
- [ ] Test:
  - "gia vang hom nay"
  - "sjc bao nhieu"
  - API loi thi message fallback ro rang

## 6. Horoscope Skill

- [x] Tach persona tu vi ra `horoscope.skill.ts`.
- [x] Chi nap family member birthday/context khi intent la horoscope.
- [x] Neu thieu birth time/place thi hoi them, khong tao event.
- [x] Khong dung tool mutation tru khi user noi ro "luu vao lich".
- [ ] Test:
  - hoi tu vi chung
  - hoi theo ngay sinh user
  - thieu du lieu thi hoi them

## 7. General Chat Skill

- [x] Tao `general-chat.skill.ts`.
- [x] Prompt ngan nhat co the.
- [x] Khong bat tools mac dinh.
- [x] Cho phep exact response cache.
- [x] Khong nap family context neu cau hoi khong lien quan gia dinh.

## 8. Memory Skill / Profile Layer

- [x] Giu memory la layer dung chung, chua tach thanh agent.
- [x] Chuan hoa schema `notificationSettings.aiMemory`.
- [x] Ho tro:
  - `enabled`
  - `language`
  - `answerStyle`
  - `foodLikes`
  - `foodDislikes`
  - `healthRestrictions`
  - `familyNotes`
  - `note`
- [ ] Sau nay co UI de user xem/sua/xoa memory.
- [x] Khong luu memory moi tu chat tu dong neu chua co confirm cua user.

## 9. Orchestrator Refactor

- [x] `AiAgentService.chat()` chi lam:
  - save user message
  - classify intent
  - select skill
  - get relevant context
  - check cache
  - direct answer neu co
  - route model
  - call model handler
  - save assistant message
- [x] `AiAgentService.chatStream()` dung cung pipeline voi `chat()`.
- [ ] Tach phan lap code chat/stream neu an toan.
- [x] Dam bao stream van tra:
  - session id
  - status
  - cached
  - usage
  - content chunks

## 10. Testing And Safety

- [ ] Them unit test cho intent router.
- [ ] Them unit test cho skill registry.
- [ ] Them unit test cho direct-answer formatters.
- [ ] Them integration smoke test cho chat va stream neu test infra cho phep.
- [x] Chay:
  - backend type-check
  - backend build
  - frontend type-check
  - frontend build
  - `git diff --check`
  - `gitnexus detect-changes`

## 11. Multi-Agent Decision Gate

Chi xem xet multi-agent neu xuat hien it nhat 2 dieu kien:

- [ ] Mot request can nhieu buoc doc/phan tich/kiem chung doc lap.
- [ ] Can planner rieng de chia task.
- [ ] Can reviewer rieng de kiem tra ket qua truoc khi tra loi.
- [ ] Can chay song song nhieu nguon du lieu.
- [ ] Single-agent tool routing bat dau kho debug hoac qua cham.

Neu chua dat cac dieu kien tren, tiep tuc dung `single agent + skills`.

## Thu Tu Thuc Hien De Xuat

1. Skill contract
2. Skill registry
3. General chat skill
4. Market skill
5. Meal skill
6. Calendar skill
7. Horoscope skill
8. Orchestrator cleanup
9. Tests
10. Multi-agent review sau khi dung on dinh
