# AI Optimization Plan

Muc tieu: giam latency, giam token/cost, va giu chat AI on dinh khi deploy production.

## 1. Response Cache

- [x] Them exact cache cho cau hoi khong can tool.
- [x] Cache theo `familyId`, `userId`, `model`, cau hoi da normalize, va phien ban prompt.
- [x] Khong cache cac cau hoi co du lieu thay doi nhanh: gia vang, lich, tao/sua/xoa su kien, cau hoi co anh.
- [x] Them TTL cho cache, vi du 1-24 gio tuy loai cau hoi.
- [x] Sau khi exact cache on dinh, da xem xet semantic cache bang embedding/vector similarity. Ket luan: chua bat mac dinh vi can vector store/embedding rieng de tranh tra nham cau hoi gan giong.

Ten goi: `LLM cache`, `response cache`, hoac `semantic cache`.

## 2. Intent Router

- [x] Tao router nhanh truoc khi goi model de phan loai intent.
- [x] Cac intent can co:
  - general chat
  - calendar query
  - create/update/delete event
  - gold price
  - meal suggestion
  - horoscope
  - image/vision
- [x] Dung router de quyet dinh co can tools hay khong.
- [x] Dung router de chon prompt phu hop.
- [x] Ghi log intent de debug khi AI tra loi cham hoac sai tool.

## 3. Prompt Routing And Prompt Slimming

- [x] Tach system prompt thanh nhieu prompt nho theo intent.
- [x] Cau hoi thuong chi dung prompt ngan.
- [x] Cau hoi lich moi nap rule calendar/lunar/event tools.
- [x] Cau hoi tu vi moi nap persona tu vi.
- [x] Cau hoi mon an moi nap rule meal/menu.
- [x] Do latency/token bang observability log va usage snapshot sau khi rut gon prompt.

Can than: `getSystemPrompt` la luong HIGH impact, nen moi thay doi can test ky.

## 4. Model Routing

- [x] Them env cho model nhanh va model chat luong cao:
  - `AI_FAST_MODEL`
  - `AI_REASONING_MODEL`
  - `AI_TOOL_MODEL`
- [x] Cau hoi ngan/thuong dung model nhanh.
- [x] Cau hoi can tool dung model on dinh hon.
- [x] Cau hoi dai/tu vi/giai thich dung model chat luong cao.
- [x] Cho phep fallback neu model chinh loi/rate limit.

## 5. Tool-First Execution

- [x] Neu intent qua ro, backend goi service/API truc tiep truoc khi goi AI.
- [x] Vi du:
  - "gia vang hom nay" -> goi gold API truc tiep.
  - "hom nay an gi" -> goi menu service truc tiep.
  - "lich thang nay" -> goi events service truc tiep.
- [x] Sau do co the dung AI de format cau tra loi, hoac tra thang neu ket qua da dep.
- [x] Giam so lan model phai tu quyet dinh tool.

## 6. Memory And User Profile

- [x] Luu preferences cua user: cach xung ho, do dai cau tra loi, ngon ngu, style.
- [x] Luu so thich mon an, mon khong thich, han che suc khoe neu co.
- [x] Luu thong tin gia dinh hay duoc hoi de giam viec hoi lai.
- [x] Them quyen xoa/disable memory de an toan du lieu.

## 7. RAG For Family Data

- [x] Khong nap toan bo family context vao moi prompt.
- [x] Chi lay du lieu lien quan theo intent.
- [x] Vi du:
  - hoi sinh nhat -> chi lay birthday/events.
  - hoi mon an -> chi lay meal preferences/history.
  - hoi lich -> chi lay events trong khoang ngay.
- [x] Can nhac embedding neu du lieu gia dinh lon. Ket luan: de thanh phase sau neu family data tang lon.

## 8. Structured Tool Results

- [x] Chuan hoa ket qua tool thanh JSON ngan gon.
- [x] Gioi han field tra ve cho AI de giam token.
- [x] Them formatter rieng cho tung tool neu khong can AI format.
- [x] Dam bao tool error tra ve cau truc thong nhat.

## 9. Observability

- [x] Log latency tung buoc:
  - save user message
  - get family context
  - get history
  - model call
  - tool execution
  - first token time
  - total response time
- [x] Log model, intent, token limit, co dung cache hay khong.
- [x] Them request id de trace mot cau hoi tu frontend den backend.
- [x] Dung so lieu nay de quyet dinh toi uu tiep theo.

## 10. Frontend UX

- [x] Hien thi trang thai theo buoc:
  - Dang kiem tra lich
  - Dang lay gia vang
  - Dang tao cau tra loi
- [x] Them nut cancel/abort stream.
- [x] Hien thi badge "cached" neu cau tra loi lay tu cache.
- [x] Giam render qua day khi token stream ve nhanh.

## Suggested Order

1. Observability
2. Intent router
3. Prompt slimming
4. Response cache
5. Tool-first execution
6. Model routing
7. Memory/profile
8. RAG
9. Structured tool results
10. Frontend UX polish
