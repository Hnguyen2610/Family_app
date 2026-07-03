# Telegram Service Split Plan

## Goal
Phân rã file `telegram.service.ts` cồng kềnh thành các sub-services và handlers chuyên biệt (Injectable) để loại bỏ circular dependency với `AiAgentService` và làm sạch cấu trúc module theo đúng thiết kế SOLID.

## Tasks
- [x] Task 1: Tạo `telegram-sender.ts` chứa các hàm gửi tin nhắn độc lập.
  - Verify: Chạy compile backend không có lỗi syntax.
- [x] Task 2: Tạo `telegram-context.service.ts` để xử lý logic lấy thông tin User/Family tương ứng với chatId hoặc group.
  - Verify: Compile backend thành công.
- [x] Task 3: Tạo `telegram-family-note.service.ts` xử lý bộ nhớ đệm các đề xuất lưu ghi chú gia đình.
  - Verify: Compile backend thành công, không xung đột state.
- [x] Task 4: Tạo `telegram-ai-responder.service.ts` chứa các hàm wrap xử lý chat với `AiAgentService` (loại bỏ dependencies chéo từ Telegram sang AiAgentService).
  - Verify: Thành công inject `AiAgentService` vào `TelegramAiResponder`.
- [x] Task 5: Tạo các handlers: `telegram-command-handlers.ts`, `telegram-action-handlers.ts`, và `telegram-message-handlers.ts`.
  - Verify: Triển khai phương thức `register(bot: Telegraf)` chấp nhận đăng ký vào bot.
- [x] Task 6: Cấu hình lại `telegram.module.ts` để khai báo toàn bộ các providers mới vừa tạo.
  - Verify: Hệ thống dependency injection của NestJS biên dịch không lỗi.
- [x] Task 7: Thay thế mã nguồn trong `telegram.service.ts` để chỉ đóng vai trò bootstrap bot, liên kết cấu hình webhook/polling và kích hoạt các handlers.
  - Verify: Tệp `telegram.service.ts` giảm từ ~1000 dòng xuống dưới 150 dòng.
- [x] Task 8: Thực hiện build và kiểm tra hệ thống.
  - Verify: `npm run build` backend thành công; kiểm tra không còn thông báo circular dependency logs.

## Done When
- [x] Toàn bộ module Telegram được phân rã thành công thành 2 lớp: handlers và sub-services chuyên biệt.
- [x] `TelegramService` không còn phụ thuộc vòng lặp (circular dependency) với `AiAgentService`.
- [x] Dự án Backend compile và khởi chạy bình thường không có lỗi DI.
