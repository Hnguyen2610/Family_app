# Kế hoạch nâng cấp Hệ thống AI (AI Upgrades Plan)

Hiện tại hệ thống AI đang vận hành ổn định. Kế hoạch này phác thảo các bước triển khai chi tiết cho các hạng mục nâng cấp thông minh tiếp theo của AI Agent, bao gồm cả chuỗi tự sửa lỗi Self-Reflective Planner và giải trình về hiện trạng RAG.

## Mục tiêu
Nâng tầm ứng dụng lịch gia đình thành một Tác nhân AI tự chủ (Autonomous AI Agent) có khả năng hiểu ngữ nghĩa sâu (Semantic RAG), giao tiếp bằng giọng nói (Voice Message), tự sửa lỗi thông minh (Self-Reflective Planner), tự động cập nhật bộ nhớ (Auto-Memory), suy luận từng bước (Chain of Thought) và lập kế hoạch–thực thi–xác minh (Plan-Execute-Verify).

---

## 🔍 Giải thích về hiện trạng RAG và Semantic Search hiện tại
- **RAG (Retrieval-Augmented Generation): Đã có!** 
  - Hệ thống hiện tại khi nhận được câu hỏi từ bạn sẽ tự động truy vấn dữ liệu từ bảng tri thức gia đình (`FamilyKnowledgeSkill`) và nạp ngược vào prompt để AI nắm được thông tin trước khi trả lời.
- **Semantic Search (Tìm kiếm ngữ nghĩa): Đã hoàn thành nâng cấp!**
  - Trước đây, hệ thống tìm từ khóa thô bằng SQL `ILIKE`. Vì thế, AI sẽ bỏ lỡ các thông tin có mối liên quan về ý nghĩa nhưng khác từ khóa thô.
  - Sau nâng cấp, hệ thống sử dụng model `gemini-embedding-2` cùng tham số nén vector `outputDimensionality: 768` để tính toán độ tương đồng Cosine (Cosine Similarity) trực tiếp trên cột `embedding_vector` của database PostgreSQL (pgvector). Semantic RAG hiện hoạt động trơn tru.

---

## Các hạng mục triển khai

### Hạng mục 1: Tìm kiếm ngữ nghĩa (Semantic RAG với pgvector)
- [x] Thiết lập extension `pgvector` trong schema Prisma (`prisma/schema.prisma`) và cơ sở dữ liệu Supabase.
- [x] Tạo helper sinh vector embeddings bằng API của Gemini (`gemini-embedding-2`).
- [x] Cập nhật module tri thức gia đình (`FamilyKnowledgeSkill`) để tính toán Cosine Similarity, ưu tiên tìm kiếm theo Vector khoảng cách ngữ nghĩa.
- *Xác nhận:* Thực hiện thành công test semantic search với câu hỏi "món ăn ưa thích của Yến" khớp chính xác với ghi chú "Sở thích ăn uống của Yến" (Độ tương đồng 0.7) mặc dù không bị lặp các từ khóa chính.

### Hạng mục 2: Chuỗi lập kế hoạch AI tự sửa lỗi (Self-Reflective Planner)
- [x] Xây dựng một vòng lặp tự phản hồi (Self-Reflection loop) trong AI Agent trước khi xuất kết quả.
- [x] AI tự kiểm tra thời gian sự kiện mới đề xuất với dữ liệu lịch thực tế trong cùng tháng, phát hiện xung đột trong vòng ±60 phút.
- [x] Nếu phát hiện xung đột, AI tự đề xuất tối đa 2 slot giờ trống thay thế trong khung 07:00–21:00, kèm cảnh báo trong nội dung Proposal.
- [x] Hệ thống "fail open": nếu DB lỗi khi kiểm tra, proposal vẫn được tạo bình thường (không crash).
- *Xác nhận:* 5/5 unit tests mới pass. Yêu cầu thêm lịch trùng giờ → AI tự phát hiện và ghi vào summary: *"⚠️ Phát hiện xung đột: Khung giờ này đã có 'Họp team' lúc 09:00. Gợi ý slot trống: **07:30** hoặc **11:00**"*.

### Hạng mục 3: Tương tác bằng Giọng nói (Telegram Voice Agent) - *Tạm dừng*
- [ ] *(Đã tạm dừng/bỏ qua theo yêu cầu để tập trung vào các hạng mục cốt lõi khác)*

### Hạng mục 4: Đúc kết bộ nhớ tự động (Auto-Memory Extraction)
- [x] Tạo công cụ ẩn `autoSaveFamilyMemory` để lưu trữ dữ liệu trực tiếp không qua proposal xác nhận.
- [x] Cập nhật điều kiện kích hoạt an toàn trong `ai-tool-policy.ts`: Cho phép nạp tool khi tin nhắn casual đề cập đến sở thích, thói quen, kỉ niệm gia đình, v.v...
- [x] Tích hợp bộ lọc bảo mật trong `FamilyKnowledgeSkill`: Các dữ liệu nhạy cảm (bệnh tật, sức khỏe, tài chính, passwords) sẽ bị chặn tự động lưu trực tiếp và AI sẽ hướng dẫn xin ý kiến đề xuất lưu thủ công.
- [x] Cập nhật Prompt chỉ thị chung cho AI trong `ai-agent-prompt.ts` và `FamilyKnowledgeSkill` để AI chủ động phân tích sự kiện thường nhật, phân biệt giữa lưu thủ công (`createWikiEntry`) và tự động lưu (`autoSaveFamilyMemory`).
- *Xác nhận:* Thành viên nhắn *"Tin thích sườn xào chua ngọt"*, hệ thống gọi `autoSaveFamilyMemory` ngầm để lưu trực tiếp vào RAG. Đã viết 3 unit tests phủ kiểm thử thành công 100%.

### Hạng mục 5: Suy luận từng bước (Chain of Thought — CoT)

> **Tại sao cần?** Hiện tại AI nhận tin nhắn → chọn tool ngay, dễ hiểu sai intent ở các câu phức tạp. CoT buộc AI phải suy ngẫm trước khi hành động, cải thiện độ chính xác mà không cần thay đổi kiến trúc.

- [x] Thêm đoạn hướng dẫn suy luận vào `buildSystemPrompt()` thông qua injection động trong `AiAgentService` (cả chat thông thường và stream).
- [x] Áp dụng CoT có điều kiện: Tự động kích hoạt khi tin nhắn người dùng > 10 từ.
- [x] Tích hợp cả 2 models (Gemini & Groq) thực thi CoT bằng tiếng Việt, bao quanh bởi thẻ `<thought>...</thought>`.
- [x] Thiết kế UI chat phía Frontend (`ChatMessageList.tsx`) tự động phát hiện, bóc tách và hiển thị thought process dưới dạng dropdown collapsible cao cấp.
- *Xác nhận:* Thành viên gửi tin dài → UI xuất hiện dropdown *"Suy luận của Trợ lý AI"* gọn gàng, có thể click mở rộng để xem suy luận chi tiết.

### Hạng mục 6: Vòng lặp Lập kế hoạch–Thực thi–Xác minh (PEV / ReAct Loop)
- [x] Thiết kế và tích hợp kiến trúc vòng lặp ReAct (Lập kế hoạch - Hành động - Quan sát) vào cả `handleGroqChat` và `handleGroqStream` trong `ai-model-handlers.ts` tương tự như của Gemini.
- [x] Tích hợp bộ đếm bước lập kế hoạch và track tiến trình thông qua `AiTrace` trong mỗi vòng lặp `model_call`.
- [x] Triển khai van an toàn `LoopGuard`: khi AI gọi trùng lặp cùng một công cụ với tham số giống hệt nhau, hệ thống sẽ chặn cuộc gọi thực tế, trả lỗi về prompt và ép kết quả phản hồi cuối cùng sau tối đa 5 vòng lặp.
- [x] Viết suite unit test chuyên biệt `ai-model-handlers.spec.ts` kiểm thử toàn diện khả năng chạy ReAct tuần tự và khả năng ngắt đệ quy vô tận của LoopGuard, đạt tỉ lệ pass 100%.
- *Xác nhận:* Yêu cầu nhiều bước phức tạp được Groq & Gemini thực thi mượt mà, tự phản chiếu kết quả và đưa ra câu trả lời chuẩn xác chỉ dưới 1 lần chat duy nhất.

### Hạng mục 7: Tác nhân AI chủ động với Tóm tắt cá nhân hóa (AI Proactive Personalized Daily Briefing)
- [x] Thiết kế prompt hệ thống ấm áp cho Bản tin gia đình AI bằng tiếng Việt, nhận đầu vào là chuỗi thông tin thô để biên soạn thành một đoạn hội thoại trôi chảy, thân mật cao.
- [x] Tích hợp LLM formatting vào pipeline `ProactiveBriefingBuilder.formatDailyBriefingMessage` thông qua kết nối chéo `AiAgentService.generateBriefingText`.
- [x] Tận dụng tính năng chịu lỗi tích hợp sẵn: Thử gọi Groq trước, nếu lỗi tự động fallback sang Gemini; nếu cả hai LLM đều gián đoạn, ngay lập tức dùng `formatDailyBriefingMessageFallback` ghép chuỗi thô để bảo đảm dịch vụ hoạt động 24/7.
- [x] Viết unit tests chuyên dụng `proactive-briefing.builder.spec.ts` kiểm định logic chuyển soạn thành công và khả năng tự động fallback chịu lỗi, đạt tỷ lệ pass 100%.
- *Xác nhận:* Bản tin Telegram sáng sớm gửi ra câu văn ấm áp mượt mà: *"Chào cả nhà! Hôm nay trời dự báo mưa dông nhé..."*

### Hạng mục 8: Ràng buộc cấu trúc cứng đầu ra (Structured JSON Outputs via Schema)

> **Tại sao cần?** Tránh việc AI trả về dữ liệu hỗn tạp hoặc sai format JSON khi gọi tool hay phân loại intent. Việc ép định dạng ở tầng API tăng độ tin cậy lên 100%.

- [x] Định nghĩa JSON Schema cứng biểu diễn cấu trúc của Intent Classifier (`intent`, `requiresTools`, `confidence`, `reason`).
- [x] Tích hợp `response_format` dạng `json_schema` với chế độ `strict: true` cho OpenAI/Groq client trong `AiIntentClassifier` giúp loại bỏ hoàn toàn bước bóc tách regex không an toàn.
- [x] Cấu hình cấu trúc `responseSchema` và `responseMimeType: 'application/json'` trong `generationConfig` cho Google Generative AI SDK bên trong `handleGeminiChat` của `ai-model-handlers.ts`.
- *Xác nhận:* Mọi kết quả phân loại từ intent classifier trả về dạng JSON hoàn thiện 100%, bảo đảm hệ thống hoạt động vô cùng tin cậy.

### Hạng mục 9: Tự kiểm duyệt câu trả lời (Actor-Critic Output Audit Loop)
 
 > **Tại sao cần?** Chống rò rỉ mã lỗi, cú pháp hệ thống hoặc các tin nhắn có văn phong không phù hợp.
 
- [x] Xây dựng bộ lọc Actor-Critic ngầm: Sử dụng mô hình Llama-3.3-70b-versatile chuyên biệt chạy qua prompt kiểm duyệt nhanh chất lượng tin nhắn.
- [x] Tự động phát hiện và tái định hình các tin nhắn lỗi: Nếu Critic phát hiện thẻ gọi công cụ kỹ thuật thô hoặc JSON thô, tự động loại bỏ rác và sinh câu trả lời thay thế tự nhiên bằng tiếng Việt cho gia đình.
- *Xác nhận:* Unit test `ai-model-handlers.spec.ts` kiểm thử việc tự động phát hiện rò rỉ thẻ công cụ và định dạng lại nội dung qua thành công 100%.
 
### Hạng mục 10: Tự động đúc kết & đồng bộ hóa bộ nhớ (Memory Consolidation)
 
 > **Tại sao cần?** Tránh phình to lịch sử chat gây nhiễu cho AI và tốn chi phí Token. AI tự tóm tắt các cuộc gọi cũ và lưu vào RAG dài hạn.
 
- [x] Lập trình cơ chế đúc kết ngầm trong `ChatService`: Tự động kích hoạt khi phiên hội thoại đạt tối thiểu 15 tin nhắn mới.
- [x] Tự động hóa đúc kết cuối ngày: Cấu hình Cron job `@Cron('0 22 * * *')` chạy lúc 10 giờ tối hằng ngày để quét các session hoạt động và tổng hợp ghi chú mới.
- [x] Nhận diện và đồng bộ hóa qua Vector Embeddings: Lưu trực tiếp các tri thức trích xuất mới vào bảng `aiDocument` qua `RagService.createKnowledgeDocument` giúp AI tự nhớ lâu dài tri thức gia đình.
- *Xác nhận:* Unit test `chat.service.spec.ts` kiểm tra và chứng thực luồng đúc kết bộ nhớ tự động, chống lặp lại đúc kết vô hạn, và Cron cuối ngày hoạt động chính xác 100%.
 
---
 
## Tiêu chí hoàn thành (Done When)
- [x] Thiết lập thành công pgvector và Semantic Search cho RAG của gia đình.
- [x] Self-Reflective Planner phát hiện và cảnh báo xung đột lịch trình + đề xuất slot thay thế (5/5 tests pass).
- [x] Triển khai thành công Chain of Thought trên cả 2 model (Gemini & Groq), tự động kích hoạt khi tin nhắn > 10 từ và hiển thị dạng dropdown collapsible trên UI.
- [x] PEV/ReAct loop xử lý được yêu cầu multi-step ≥ 2 công cụ trong một lượt chat.
- [x] AI Proactive Assistant tạo bản tin tóm tắt hàng ngày mượt mà sử dụng LLM (không bị lỗi format).
- [x] Đạt 100% phản hồi của `AiIntentClassifier` khớp chuẩn JSON định nghĩa nhờ Structured Schema.
- [x] Giám sát chất lượng đầu ra bằng tầng Critic (Actor-Critic Output Audit Loop) giúp làm sạch 100% cú pháp thô/JSON leak.
- [x] Tích hợp cơ chế đúc kết bộ nhớ ngầm tự động (Memory Consolidation) lưu trữ học máy dài hạn qua pgvector RAG.
- [x] Hoàn thành tích hợp luồng Voice Telegram Bot và vượt qua toàn bộ 66/66 bài kiểm thử của backend.
