import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLunarDateObject, getZodiacYearInfo } from '../../../utils/lunar-calendar.util';
import { withGeminiRetry } from '../ai-model-handlers';

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
- Gợi ý hành vi thực tế, dễ áp dụng để người dùng chủ động cải thiện cuộc sống.

Nguyên tắc (P0):
1. KHÔNG CHUNG CHUNG: Tránh các câu vô thưởng vô phạt như "có cơ hội mới". Phải giải thích tại sao hoặc làm thế nào.
2. THỰC TẾ & TRUNG LẬP: Không tâng bốc, không bịa đặt tương lai. Chỉ ra rủi ro và áp lực nếu có.
3. ĐỊNH DẠNG HTML: Trình bày bằng thẻ <b> cho tiêu đề, <p> cho đoạn văn. Không dùng markdown.

Cấu trúc bản tin bắt buộc (6 mục):
1. 🌟 Tổng quan tuần mới
2. 💼 Sự nghiệp & Công việc
3. 💰 Tài lộc
4. ❤️ Tình duyên & Mối quan hệ
5. 🍏 Sức khỏe
6. 🎐 Gợi ý trong tuần (Con số, màu sắc hoặc hành động cụ thể)
7. ⚠️ Cảnh báo (nếu có rủi ro hoặc áp lực đặc biệt trong tuần)
8. 📌 Lời khuyên tổng quan cho tuần mới
9. 📝 Lời nhắn nhủ (nếu có)
`;
  }

  /**
   * System prompt for ad-hoc horoscope questions asked directly in chat (e.g. "tử vi hôm nay
   * của tôi thế nào?") — conversational and scoped to the actual question, unlike the fixed
   * 9-section weekly newsletter format used by the Monday cron job.
   */
  private getOnDemandSystemInstruction(): string {
    return `
Bạn là "Horoscope Specialist" - Chuyên gia luận giải tử vi, chiêm tinh và phong thủy đời sống trong hệ thống Family Assistant, đang trả lời trực tiếp trong khung chat với người dùng.

Nguyên tắc (P0):
1. KHÔNG CHUNG CHUNG: Tránh các câu vô thưởng vô phạt như "có cơ hội mới". Phải giải thích tại sao hoặc làm thế nào.
2. THỰC TẾ & TRUNG LẬP: Không tâng bốc, không bịa đặt tương lai. Chỉ ra rủi ro và áp lực nếu có.
3. NGẮN GỌN, TỰ NHIÊN: Trả lời như đang trò chuyện, khoảng 3-6 câu, bám sát đúng trọng tâm câu hỏi (hôm nay, tuần này, hay tổng quan...). KHÔNG cần đủ cấu trúc nhiều mục cố định như bản tin tuần.
4. ĐỊNH DẠNG: Văn bản thuần, không dùng HTML hay markdown.
`;
  }

  private buildBirthdayInfo(birthday?: Date): string {
    if (!birthday) {
      return 'Người dùng chưa cung cấp ngày sinh. Hãy trả lời theo hướng nhận định tổng quan dựa trên năng lượng hiện tại, không hỏi lại ngày sinh.';
    }
    const lunar = getLunarDateObject(birthday);
    const zodiac = getZodiacYearInfo(lunar.year);
    return `Người dùng sinh ngày dương lịch ${birthday.toISOString().split('T')[0]}, tức ngày ${lunar.day}/${lunar.month} âm lịch năm ${zodiac.canChi}. Tuổi ${zodiac.conGiap}, mệnh ${zodiac.menhNguHanh}. Hãy dùng đúng thông tin can chi/con giáp/mệnh này để luận giải, không tự tính toán lại.`;
  }

  private getIctToday(): string {
    const now = new Date();
    const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return ictDate.toISOString().split('T')[0];
  }

  /**
   * Generate a personalized weekly horoscope
   */
  async generateWeeklyHoroscope(userName: string, birthday?: Date): Promise<string> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: 'gemini-flash-latest',
        systemInstruction: this.getSystemInstruction(),
      });

      const prompt = `
Hôm nay là ngày ${this.getIctToday()}.
Hãy soạn bản tin tử vi cho tuần mới cho người dùng: ${userName}.

Thông tin cá nhân:
${this.buildBirthdayInfo(birthday)}

Yêu cầu:
- Mỗi mục viết từ 2-4 câu có chiều sâu.
- Chỉ trả về HTML, không thêm đoạn giải thích ngoài.
`;

      const result = await withGeminiRetry(() => model.generateContent(prompt), this.logger, 'Weekly horoscope');
      const text = result.response.text();
      return text || 'Không thể tạo bản tin tử vi lúc này.';
    } catch (e) {
      this.logger.error('Horoscope Generation Error:', e);
      return 'Xin lỗi, các vì sao hôm nay đang bị che khuất, tôi chưa thể đưa ra dự đoán.';
    }
  }

  /**
   * Generate a horoscope reply to an ad-hoc chat question (e.g. "tử vi hôm nay của tôi
   * thế nào?"), as opposed to the fixed weekly newsletter from the Monday cron job.
   */
  async generateOnDemandHoroscope(userName: string, birthday: Date | undefined, question: string): Promise<string> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: 'gemini-flash-latest',
        systemInstruction: this.getOnDemandSystemInstruction(),
      });

      const prompt = `
Hôm nay là ngày ${this.getIctToday()}.
Người dùng: ${userName}.
${this.buildBirthdayInfo(birthday)}

Câu hỏi của người dùng: "${question}"

Hãy trả lời trực tiếp câu hỏi trên.
`;

      const result = await withGeminiRetry(() => model.generateContent(prompt), this.logger, 'On-demand horoscope');
      const text = result.response.text();
      return text || 'Không thể xem tử vi lúc này.';
    } catch (e) {
      this.logger.error('On-demand Horoscope Generation Error:', e);
      return 'Xin lỗi, các vì sao hôm nay đang bị che khuất, tôi chưa thể đưa ra dự đoán.';
    }
  }
}
