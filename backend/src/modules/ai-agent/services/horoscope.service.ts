import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class HoroscopeService {
  private readonly logger = new Logger(HoroscopeService.name);
  private readonly gemini: GoogleGenerativeAI;

  constructor() {
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  /**
   * System prompt (Agent Persona & Rules)
   */
  private getSystemInstruction(): string {
    return `
Bạn là "Horoscope Specialist" - Chuyên gia luận giải tử vi, chiêm tinh và phong thủy đời sống trong hệ thống Family Assistant.

Mục tiêu của bạn:
- Đưa ra nhận định tham khảo cho tuần mới dựa trên xu hướng năng lượng.
- Phân tích và lồng ghép khéo léo lịch trình/sự kiện thực tế của người dùng để đưa ra lời khuyên sát sườn.
- Gợi ý hành vi thực tế, dễ áp dụng để người dùng chủ động cải thiện cuộc sống.

Nguyên tắc (P0):
1. KHÔNG CHUNG CHUNG: Tránh các câu vô thưởng vô phạt như "có cơ hội mới". Phải giải thích tại sao hoặc làm thế nào.
2. THỰC TẾ & TRUNG LẬP: Không tâng bốc, không bịa đặt tương lai. Chỉ ra rủi ro và áp lực nếu có.
3. TẬP TRUNG VÀO CONTEXT: Nếu có thông tin về sự kiện trong tuần (họp hành, sinh nhật, kỷ niệm), hãy ưu tiên luận giải xung quanh các cột mốc đó.
4. ĐỊNH DẠNG HTML: Trình bày bằng thẻ <b> cho tiêu đề, <p> cho đoạn văn. Không dùng markdown.

Cấu trúc bản tin bắt buộc (6 mục):
1. 🌟 Tổng quan tuần mới
2. 💼 Sự nghiệp & Công việc (Phải kết nối với các sự kiện thực tế trong tuần của người dùng)
3. 💰 Tài lộc
4. ❤️ Tình duyên & Mối quan hệ
5. 🍏 Sức khỏe
6. 🎐 Gợi ý trong tuần (Con số, màu sắc hoặc hành động cụ thể)
`;
  }

  /**
   * Generate a personalized weekly horoscope
   */
  async generateWeeklyHoroscope(userName: string, birthday?: Date, context: string = ''): Promise<string> {
    try {
      const now = new Date();
      const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const today = ictDate.toISOString().split('T')[0];

      const model = this.gemini.getGenerativeModel({
        model: 'gemini-flash-latest',
        systemInstruction: this.getSystemInstruction(),
      });

      const birthdayInfo = birthday
        ? `Người dùng sinh ngày ${birthday.toISOString().split('T')[0]}.`
        : `Người dùng chưa cung cấp ngày sinh. Hãy viết theo hướng nhận định tổng quan dựa trên năng lượng của ngày hiện tại.`;

      const prompt = `
Hôm nay là ngày ${today}.
Hãy soạn bản tin tử vi cho tuần mới cho người dùng: ${userName}.

Thông tin cá nhân:
${birthdayInfo}

Dữ liệu lịch trình & bối cảnh tuần tới (DÙNG ĐỂ CÁ NHÂN HÓA):
${context || 'Không có sự kiện đặc biệt nào được ghi nhận.'}

Yêu cầu:
- Mỗi mục viết từ 2-4 câu có chiều sâu.
- Kết nối các sự kiện trong lịch trình với các nhận định chiêm tinh.
- Chỉ trả về HTML, không thêm đoạn giải thích ngoài.
`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return text || 'Không thể tạo bản tin tử vi lúc này.';
    } catch (e) {
      this.logger.error('Horoscope Generation Error:', e);
      return 'Xin lỗi, các vì sao hôm nay đang bị che khuất, tôi chưa thể đưa ra dự đoán.';
    }
  }
}
