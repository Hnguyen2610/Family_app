export const TELEGRAM_COMMANDS = [
  { command: 'app', description: 'Mở bảng điều khiển dạng nút bấm' },
  { command: 'help', description: 'Xem tất cả các lệnh của bot' },
  { command: 'status', description: 'Xem trạng thái liên kết và family đang dùng' },
  { command: 'families', description: 'Xem danh sách family có thể chọn' },
  { command: 'use_family', description: 'Chọn family: /use_family 1 hoặc /use_family <familyId>' },
  { command: 'today', description: 'Xem lịch hôm nay, thời tiết và việc cần chú ý' },
  { command: 'week', description: 'Xem lịch 7 ngày tới' },
  { command: 'weather', description: 'Xem thời tiết: /weather Hà Nội' },
  { command: 'note', description: 'Đề xuất lưu ghi chú vào sổ tay gia đình' },
  { command: 'gold', description: 'Xem giá vàng mới nhất' },
  { command: 'football', description: 'Xem lịch thi đấu bóng đá' },
  { command: 'search', description: 'Tìm kiếm Internet' },
  { command: 'menu', description: 'Gợi ý thực đơn hôm nay' },
  { command: 'events', description: 'Xem lịch tháng này' },
  { command: 'events_next', description: 'Xem lịch tháng sau' },
  { command: 'horoscope', description: 'Xem tử vi/chiêm tinh' },
  { command: 'stats', description: 'Xem thống kê AI, chỉ dành cho admin' },
  { command: 'link_group', description: 'Liên kết group Telegram với family' },
];

export const TELEGRAM_FEEDBACK_OPTIONS = [
  { label: 'Đúng', value: 'correct' },
  { label: 'Sai', value: 'wrong' },
  { label: 'Thiếu context', value: 'missing_context' },
  { label: 'Sai family', value: 'wrong_family' },
  { label: 'Sai ngày/giờ', value: 'wrong_datetime' },
] as const;

export function buildWelcomeMessage(userName: string) {
  return [
    `🎉 <b>Chào mừng ${userName}!</b>`,
    'Bạn đã kết nối thành công tài khoản Family App với Telegram.',
    'Từ bây giờ bot có thể gửi thông báo và hỗ trợ trả lời theo family bạn chọn.',
  ].join('\n');
}

export function buildHelpMessage(title: string) {
  return [
    title,
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '📱 <b>BẢNG ĐIỀU KHIỂN CHÍNH</b>',
    '• /app — Mở nhanh menu phím bấm tương tác',
    '',
    '🏠 <b>QUẢN LÝ GIA ĐÌNH</b>',
    '• /families — 👪 Xem danh sách các nhóm gia đình',
    '• /use_family <code>[số|ID]</code> — 🔄 Chuyển gia đình làm việc',
    '• /status — 📊 Kiểm tra liên kết và gia đình hiện tại',
    '• /link_group <code>[ID]</code> — 🔗 Kết nối group chat nhận tin nhắc nhở',
    '',
    '✨ <b>TIỆN ÍCH AI & HỎI ĐÁP</b>',
    '• /today — Tổng quan hôm nay: lịch, thời tiết, việc cần chú ý',
    '• /week — Xem lịch 7 ngày tới',
    '• /weather <code>[địa điểm]</code> — Xem thời tiết nhanh',
    '• /note <code>[nội dung]</code> — Tạo đề xuất lưu ghi chú vào sổ tay gia đình',
    '• /football <code>[giải đấu]</code> — ⚽ Trình xem bóng đá',
    '• /search <code>[từ khóa]</code> — 🔍 Tìm tin tức mới nhất Internet',
    '• /menu — 🍜 Khơi nguồn cảm hứng ăn gì hôm nay',
    '• /events <code>[tháng]</code> — 📅 Xem lịch sự kiện (Ví dụ: <i>/events thang sau</i>)',
    '• /horoscope — 🔮 Dự báo chiêm tinh & tử vi cá nhân hóa',
    '• /gold — 🟡 Lấy giá vàng trong nước hôm nay',
    '',
    '💬 <b>HỘI THOẠI TỰ NHIÊN</b>',
    '• Gửi tin nhắn bất cứ lúc nào để chat trực tiếp với AI trợ lý.',
    '• Trong Group Chat, chỉ cần nhắn tin tự nhiên để tạo/sửa/xóa lịch hoặc nhắc ăn uống khi bot đã được kết nối gia đình.',
    '',
    '🛠️ <b>HỆ THỐNG (ADMIN)</b>',
    '• /stats — 📈 Kiểm tra hiệu năng & thông số máy chủ',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '<i>Chúc bạn và gia đình một ngày tốt lành!</i>',
  ].join('\n');
}
