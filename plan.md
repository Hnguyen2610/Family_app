# AI Upgrade Plan

Muc tieu: nang cap FamilyGPT theo huong on dinh, it loi tool-call, truy xuat dung tri thuc gia dinh, va giam viec phu thuoc qua nhieu vao model.

## 1. Structured Execution Cho Calendar Va Memory

- [x] Tach parser deterministic cho cac cau tao/sua/xoa lich pho bien.
- [x] Tu parse `date`, `time`, `title`, `scope`, `familyId`, `recurring` truoc khi goi model.
- [x] Voi cau "luu vao long memory va tao lich", backend tu execute ca `createWikiEntry` va `createEvent`.
- [x] Model chi dung de ho tro khi cau qua mo ho.
- [x] Them guard khong luu memory khi user chi hoi thong tin.
- [x] Them response format ro rang sau khi execute:
  - da luu vao so tay nao
  - da tao su kien nao
  - ngay/gio/scope/family nao

## 2. RAG / Family Knowledge Nang Cao

- [x] Chuan hoa schema family knowledge: title, content, category, familyId, sourceType.
- [x] Dam bao moi cau hoi lien quan gia dinh uu tien retrieve RAG truoc.
- [x] Cai thien search keyword hien tai.
- [x] Nang cap semantic search bang embeddings/pgvector khi database ho tro on dinh.
- [x] Tra ve source/snippet noi bo trong debug log de de kiem tra AI lay dung note.
- [x] Them co che sua/xoa note de user lam sach long memory.

## 3. Memory Workflow Ro Rang

- [x] Tach ro `User Memory Profile` va `Family Knowledge`.
- [x] Khi AI muon luu thong tin, hien proposal:
  - luu vao ho so user nao
  - hay luu vao so tay gia dinh nao
- [x] Khong tu dong luu thong tin nhay cam neu chua co confirm.
- [x] Them web UI de chap nhan/tu choi memory proposal.
- [x] Them Telegram button de chap nhan/tu choi memory proposal.
- [x] Meal skill doc memory profile de tranh mon khong thich/di ung.

## 4. Tool Result Formatter

- [x] Calendar formatter: backend format ket qua lich, khong de model tu viet function tag.
- [x] Football formatter: chi gio, ngay, giai dau, hai doi; khong link/nguon/mo ta.
- [x] Wiki formatter: tra loi ngan gon dua tren retrieved context.
- [x] Gold/market formatter: direct answer, co fallback khi API loi.
- [x] Meal formatter: output gon, de doc tren mobile va Telegram.

## 5. Intent Router Va Skill Routing

- [x] Them confidence cho intent router.
- [x] Rule router chi xu ly deterministic commands va high-confidence signals.
- [x] Natural language/mo ho thi chuyen sang LLM intent classifier.
- [x] Neu classifier confidence thap thi hoi lai thay vi doan.
- [x] Tach classifier thanh module rieng, vi du `ai-intent-classifier.ts`.
- [x] Luu confusion cases: cau hoi, rule route, classifier route, skill thuc te, ket qua.
- [x] Family-related question: RAG first.
- [x] Mutation request: structured action first.
- [x] Realtime/public info: SearchSkill first.
- [x] Image request: Vision route.
- [x] Log intent, skill, model, tools va latency cho tung request.

## 6. AI Routing Eval Suite

- [x] Tao file `ai-routing-evals.json` gom cac cau hoi dai dien.
- [x] Moi test case co:
  - input
  - expected intent
  - expected skill
  - expected tool neu co
  - ghi chu ve familyId/scope neu lien quan
- [x] Them script chay eval nhanh truoc deploy.
- [x] Bao gom cac nhom:
  - calendar query
  - event mutation
  - football broad schedule
  - football specific team schedule
  - family knowledge/RAG
  - meal
  - horoscope
  - gold/search
- [x] Log cac cau route sai de bo sung vao eval thay vi hardcode theo cam tinh.

## 7. Tool Call Validation Va Repair Layer

- [x] Tao layer validate tool args truoc khi execute.
- [x] Moi tool co schema ro rang cho required fields, enum, date/time format.
- [x] Neu model goi tool sai JSON/args thieu thi thu repair step ngan.
- [x] Neu repair van fail thi hoi lai user, khong render raw function text.
- [x] Side-effect tools nhu create/update/delete event can permission/confirmation policy.
- [x] Dam bao tool result luon qua formatter backend truoc khi tra user.

## 8. Response Sanitizer

- [x] Them final sanitizer truoc khi gui response ve web/Telegram.
- [x] Chan raw tool/function text nhu `<function=...>` hoac `internetSearch({...})`.
- [x] Neu phat hien raw tool text, replace bang message than thien va log incident.
- [x] Sanitize link/source doi voi Telegram khi formatter khong yeu cau nguon.
- [x] Them test cho cac mau raw tool leakage da tung gap.

## 9. AI Debug Dashboard

- [x] Tao trang admin xem request AI gan nhat.
- [x] Hien:
  - request id
  - user/family
  - intent
  - skill
  - model
  - tools da goi
  - RAG snippets
  - latency
  - token/usage neu co
  - error/fallback
- [x] Them filter theo model, skill, status.

## 10. Model Fallback Thong Minh

- [x] Tach fallback theo loai loi:
  - tool-call failed
  - rate limit
  - timeout
  - vision overload
  - search API failed
- [x] Tool-call failed: thu structured parser hoac Gemini.
- [x] Vision failed: retry anh nho hon/model vision khac.
- [x] Search failed: tra message ro rang, khong retry qua lau.
- [x] Log fallback reason vao observability.

## 11. Cache De Giam Latency Va Token

- [x] Exact cache cho cau hoi lap lai trong cung family.
- [x] Short TTL cache cho cac intent cacheable hien co.
- [x] Mo rong short TTL cache cho:
  - lich bong da hom nay
  - cau hoi RAG pho bien
- [x] Cache key can gom familyId, model, intent, normalized query.
- [x] Khong cache cau tao/sua/xoa du lieu.

## 12. Memory Write Policy

- [x] Dinh nghia memory type:
  - user_preference
  - family_fact
  - event_related_fact
  - health_restriction
  - temporary_note
  - sensitive_note
- [x] Moi memory write can co confidence va source message.
- [x] Thong tin nhay cam/suc khoe/tai chinh phai can confirm.
- [x] AI chi de xuat memory write, backend/UX quyet dinh co luu hay khong.
- [x] Them review UI de user sua title/content truoc khi luu.
- [x] Them co che merge/update note cu thay vi tao duplicate.

## 13. Vision To Action

- [x] Telegram/web upload anh hoa don, toa thuoc, lich hoc.
- [x] AI tao draft thay vi luu thang.
- [x] User review draft truoc khi luu.
- [x] Draft co the luu vao:
  - finance
  - calendar
  - family knowledge
- [x] Them OCR/raw text de user kiem tra.

## 14. Proactive Assistant Nang Cao

- [x] Nhac checklist truoc su kien quan trong.
- [x] Goi y qua/sinh nhat/ky niem.
- [x] Ket hop thoi tiet neu co API on dinh.
- [x] Nhac lich hoc, toa thuoc, chi tieu dinh ky.
- [x] Cho user bat/tat proactive theo tung kenh: app, webpush, Telegram.

## Thu Tu Lam De Xuat

1. Intent router LLM-first cho cau mo ho.
2. AI routing eval suite.
3. Tool call validation va repair layer.
4. Response sanitizer.
5. Structured execution cho calendar/memory.
6. Tool result formatter.
7. Memory write policy + confirm workflow.
8. RAG retrieval/debug snippets.
9. AI debug dashboard.
10. Model fallback thong minh.
11. Cache.
12. Vision to action.
13. Proactive assistant nang cao.

## Nguyen Tac

- Backend quyet dinh action quan trong, model chi ho tro hieu ngon ngu.
- Khong luu du lieu dai han neu user chi dang hoi.
- Moi action ghi DB phai co familyId/scope/userId ro rang.
- Moi skill nen co direct formatter rieng.
- Uu tien on dinh va debug duoc truoc khi them multi-agent.

---

# Next AI Feature Roadmap

Muc tieu: nang cap FamilyGPT thanh tro ly gia dinh chu dong hon, tach weather/search ro rang, cai thien Telegram va tang kha nang debug chat/RAG.

## Phase 1. Weather Skill Rieng

- [x] Tao `weather.skill.ts` thay vi de weather trong `SearchSkill`.
- [x] Route cac cau hoi weather sang `WeatherSkill`:
  - thoi tiet hom nay
  - ngay mai co mua khong
  - cuoi tuan thoi tiet the nao
  - nhiet do o dia diem khac
- [x] WeatherSkill dung `WeatherService`, khong goi Tavily khi WeatherAPI co du lieu.
- [x] Ho tro location mac dinh tu env va location user hoi truc tiep.
- [x] Formatter tieng Viet ngan gon, uu tien do C.
- [x] Them fallback khi WeatherAPI loi hoac chua cau hinh.
- [x] Them eval cho weather routing.

## Phase 2. Personalized Proactive Assistant

- [x] Gom lich, thoi tiet, finance, family notes thanh daily briefing.
- [x] Tao message chu dong theo ngu canh:
  - sap co su kien quan trong
  - ngay mai mua
  - sinh nhat/ky niem
  - toa thuoc/lich hoc/hoa don
  - chi tieu bat thuong
- [x] Dedupe notification theo loai va ngay.
- [x] Cho user bat/tat tung loai proactive:
  - event checklist
  - weather
  - finance
  - medicine/school
  - family notes
- [x] Them setting gio gui proactive.
- [x] Log proactive reason vao notification metadata.

## Phase 3. Telegram Command Center

- [x] Them `/today`: lich hom nay + thoi tiet + viec can chu y.
- [x] Them `/week`: lich 7 ngay toi.
- [x] Them `/weather [dia diem]`: du bao nhanh.
- [x] Them `/note <noi dung>`: tao proposal luu family knowledge.
- [x] Bo `/ask`: user chat thang voi bot, AI tu route theo family context.
- [x] Bo `/wiki`: cau hoi ve family wiki/RAG di qua chat tu nhien.
- [x] Dung formatter rieng cho Telegram, khong hien source/link neu khong can.
- [x] Dam bao group chat lay dung user nhan va family lien ket.

## Phase 4. RAG Quality Dashboard

- [x] Mo rong AI debug dashboard hien RAG snippets chi tiet.
- [x] Hien score, document title, category, familyId, sourceType.
- [x] Them nut copy query/retrieved context de debug.
- [x] Them filter theo `familyId`, `skill`, `hasRag`.
- [x] Log khi RAG khong tim thay context.
- [x] Them view top notes duoc retrieve nhieu nhat.

## Phase 5. AI Feedback Loop

- [x] Them UI feedback cho moi cau tra loi:
  - dung
  - sai
  - thieu context
  - sai family
  - sai ngay/gio
- [x] Luu feedback vao DB hoac request log.
- [x] Telegram support feedback bang inline buttons.
- [x] Tao report feedback trong admin dashboard.
- [x] Dung feedback de bo sung eval cases.

## Phase 6. Multi-location Weather

- [ ] Them location vao family settings hoac user settings.
- [ ] WeatherService chon location theo thu tu:
  - location user hoi truc tiep
  - family location
  - user location
  - WEATHER_LOCATION env
- [ ] Cache theo provider + location.
- [ ] Proactive weather dung location cua family/user.
- [ ] UI cho user chinh location.

## Phase 7. Calendar Natural Parser Nang Cao

- [ ] Parse `thu 7 tuan sau`, `cuoi tuan nay`, `dau thang sau`.
- [ ] Parse recurring:
  - moi thu 2
  - moi ngay
  - moi thang ngay 15
  - hang nam
- [ ] Parse reminder offset:
  - nhac truoc 1 ngay
  - nhac truoc 2 tieng
- [ ] Ho tro ngay am lich trong mutation flow.
- [ ] Them eval parser cho cac case calendar moi.

## Phase 8. AI Cost And Latency Controller

- [ ] Dinh nghia policy chon model theo intent:
  - direct/cache cho cau don gian
  - Groq cho chat nhanh
  - Gemini cho tool/vision/fallback kho
  - Weather/Football API cho realtime domain
- [ ] Log model choice reason.
- [ ] Giam goi model khi direct formatter du du lieu.
- [ ] Hien latency theo phase trong admin dashboard.
- [ ] Them circuit breaker khi provider loi lien tiep.

## Thu Tu Uu Tien

1. Weather Skill rieng
2. Telegram Command Center
3. Personalized Proactive Assistant
4. RAG Quality Dashboard
5. AI Feedback Loop
6. Multi-location Weather
7. Calendar Natural Parser Nang Cao
8. AI Cost And Latency Controller
