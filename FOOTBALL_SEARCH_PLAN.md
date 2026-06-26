# ⚽ Football & 🔍 Search Skill Implementation Plan

Dự án mở rộng AI Agent giúp tra cứu lịch bóng đá real-time và tìm kiếm Internet.

## 🏗️ Kiến trúc giải pháp
1. **FootballSkill**: Tích hợp Football-Data.org API.
2. **SearchSkill**: Tích hợp Tavily Search API.

---

## 📅 Giai đoạn 1: Chuẩn bị (Phase 1)
- [ ] **Đăng ký API Keys**:
  - Football-Data: [https://www.football-data.org/](https://www.football-data.org/)
  - Tavily: [https://tavily.com/](https://tavily.com/)
- [ ] **Cập nhật `.env`**:
  ```env
  FOOTBALL_DATA_API_KEY=your_key
  TAVILY_API_KEY=your_key
  ```

## ⚽ Giai đoạn 2: Football Skill (Phase 2)
- [ ] Tạo `backend/src/modules/ai-agent/skills/football.skill.ts`
- [ ] Tool: `getFootballMatches` (Lịch đấu/Kết quả)
- [ ] Tool: `getFootballStandings` (Bảng xếp hạng)

## 🔍 Giai đoạn 3: Tavily Search Skill (Phase 3)
- [ ] Tạo `backend/src/modules/ai-agent/skills/search.skill.ts`
- [ ] Tool: `internetSearch` (Tìm kiếm tin tức, giá cả, thông tin web)

## 🧠 Giai đoạn 4: System Prompt (Phase 4)
- [ ] Cập nhật `buildSystemPrompt` để AI biết cách dùng 2 skill mới.

---

## 🧪 Testing Checklist
- [ ] "Trận tiếp theo của Real Madrid khi nào?"
- [ ] "Tìm giúp mình review máy pha cafe Delonghi trên mạng."
