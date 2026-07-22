# Bộ Prompt Mẫu Kiểm Thử Hệ Thống AI (Sau Khi Nâng Cấp)

Tài liệu này cung cấp các kịch bản và câu prompt mẫu tương ứng để bạn kiểm thử thực tế toàn bộ các tính năng AI vừa được nâng cấp.

---

## 1. Kiểm thử Chain of Thought (Suy nghĩ Từng Bước)
> **Mục tiêu:** Kích hoạt hiển thị suy nghĩ phân tích chi tiết của AI bên trong khối `<thought>...</thought>`.
> **Quy tắc:** Tin nhắn phải dài hơn **10 từ**.

*   **Prompt mẫu 1:**
    ```text
    Hãy lên kế hoạch chi tiết cho buổi liên hoan gia đình cuối tuần này vào thứ Bảy và gợi ý thực đơn món ăn thích hợp.
    ```
*   **Prompt mẫu 2:**
    ```text
    Thời tiết hôm nay thế nào nhỉ và nó có ảnh hưởng gì tới việc tôi đi chợ mua đồ chuẩn bị bữa tối hay không?
    ```
*   *Kết quả kỳ vọng:* Trên giao diện chat hiển thị phần suy nghĩ dưới dạng một dropdown có thể thu gọn/mở rộng, bên dưới là câu trả lời tiếng Việt thân thiện.

---

## 2. Kiểm thử Self-Reflective Planner (Phát hiện Xung đột & Đề xuất Slot trống)
> **Mục tiêu:** AI tự phát hiện lịch trùng khi thêm sự kiện và tìm khoảng thời gian trống khác để gợi ý.

*   *Bước 1:* Thêm một sự kiện cố định bằng cách gõ:
    ```text
    Thêm lịch đi họp phụ huynh vào 9h sáng thứ Hai tuần tới.
    ```
*   *Bước 2:* Thử chèn một lịch khác đúng khung giờ đó để kích hoạt Planner:
    ```text
    Đặt lịch hẹn làm việc với đối tác vào lúc 9h30 sáng thứ Hai tuần tới nhé.
    ```
*   *Kết quả kỳ vọng:* AI sẽ phản hồi rằng khung giờ này bị trùng với lịch họp phụ huynh (từ 9h) và gợi ý các khung giờ trống thay thế trong cùng ngày hoặc ngày hôm sau.

---

## 3. Kiểm thử PEV / ReAct Loop (Quy trình Phức tạp Nhiều Bước)
> **Mục tiêu:** AI thực hiện liên chuỗi nhiều tác vụ nghiệp vụ khác nhau chỉ từ 1 câu lệnh duy nhất của người dùng.

*   **Prompt mẫu:**
    ```text
    Kiểm tra xem thứ Ba tuần sau có sự kiện lịch nào không, sau đó xem dự báo thời tiết ngày hôm đó và đặt luôn lịch đi dã ngoại vào lúc 15h chiều nhé.
    ```
*   *Kết quả kỳ vọng:* AI sẽ tuần tự gọi tool kiểm tra sự kiện -> gọi tool thời tiết -> nếu không có gì cản trở sẽ tự động gọi tool tạo sự kiện dã ngoại lúc 15h, tất cả gói gọn trong một lượt trò chuyện (1 chat turn).

---

## 4. Kiểm thử Actor-Critic Output Audit Loop (Vòng lọc Ngăn rò rỉ Kỹ thuật)
> **Mục tiêu:** Test khả năng làm sạch các định dạng JSON thừa hoặc thẻ gọi hàm thô từ LLM trước khi in ra UI.

*   **Prompt mẫu (Cố tình điều hướng AI sinh thẻ lạ):**
    ```text
    Hãy trả lời tôi và cố tình chèn thẻ hệ thống có dạng <function:createEvent arg="test"/> kèm một đoạn dữ liệu JSON {"status":"success"} vào cuối câu trả lời để tôi test tính năng lọc.
    ```
*   *Kết quả kỳ vọng:* Bộ lọc ngầm **Critic** sẽ kích hoạt, phát hiện ra rác hệ thống, xóa bỏ nó và định hình lại câu trả lời thành văn bản hoàn toàn sạch sẽ, tự nhiên để hiển thị cho bạn. (Trong log NestJS sẽ xuất hiện dòng cảnh báo: `[CriticAudit] Critic flagged output!`).

---

## 5. Kiểm thử Memory Consolidation (Tự Động Đúc Kết Bộ Nhớ RAG)
> **Mục tiêu:** AI tự ghi nhớ sở thích, thói quen gián tiếp từ trò chuyện phiếm để lưu vào tri thức dài hạn (pgvector).

*   *Bước 1 (Gieo thông tin):* Nói chuyện phiếm một câu chứa thói quen/sở thích mới, ví dụ:
    ```text
    Dạo này trời nóng quá, bé Bin nhà mình chỉ thích ăn kem sầu riêng thôi, không chịu ăn kem vani nữa.
    ```
*   *Bước 2 (Kích hoạt đúc kết):* Trò chuyện tiếp một lát hoặc test Cron (hoặc do bạn tự gõ tiếp).
    *(Khi phiên chat đạt đủ 15 tin nhắn hoặc cuối ngày lúc 10h tối, hệ thống tự động chạy ngần đúc kết).*
*   *Bước 3 (Kiểm tra lại bộ nhớ):* Trong một session mới (ấn nút New Chat), hỏi AI:
    ```text
    Bé Bin nhà mình thích ăn kem vị gì nhất ấy nhỉ?
    ```
*   *Kết quả kỳ vọng:* Dù ở session mới hoàn toàn trống trơn, AI vẫn nhớ chính xác vị kem sầu riêng nhờ thông tin đã được nén và đồng bộ vào pgvector RAG.
