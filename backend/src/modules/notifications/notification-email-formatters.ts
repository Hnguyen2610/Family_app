type EventCategoryInfo = {
  emoji: string;
  title: string;
  color: string;
  bgColor: string;
};

export function getEventCategoryInfo(type: string): EventCategoryInfo {
  switch (type) {
    case 'BIRTHDAY':
      return { emoji: '🎂', title: 'Sinh nhật', color: '#e11d48', bgColor: '#fff1f2' };
    case 'HOLIDAY':
      return { emoji: '🎊', title: 'Ngày lễ & Kỷ niệm', color: '#d97706', bgColor: '#fffbeb' };
    case 'ANNIVERSARY':
      return { emoji: '💍', title: 'Kỷ niệm', color: '#7c3aed', bgColor: '#f5f3ff' };
    case 'TASK':
      return { emoji: '✅', title: 'Công việc', color: '#059669', bgColor: '#ecfdf5' };
    case 'APPOINTMENT':
      return { emoji: '⏰', title: 'Lịch hẹn', color: '#2563eb', bgColor: '#eff6ff' };
    default:
      return { emoji: '📅', title: 'Sự kiện khác', color: '#4b5563', bgColor: '#f3f4f6' };
  }
}

export function buildMonthlyEmailHtml(familyName: string, month: number, events: any[]): string {
  const categories = groupEventsByCategory(events);

  const sections = Object.entries(categories).map(([title, catEvents]) => {
    const info = getEventCategoryInfo(catEvents[0].type);
    const list = catEvents.map((event) => {
      const dateStr = `${new Date(event.date).getDate()}/${month}`;
      const desc = event.description ? `(<em>${event.description}</em>)` : '';
      return `<li style="margin-bottom: 8px;"><strong>${dateStr}:</strong> ${event.title} ${desc}</li>`;
    }).join('');

    return `
      <div style="margin-bottom: 25px;">
        <h3 style="color: ${info.color}; border-bottom: 2px solid ${info.bgColor}; padding-bottom: 5px;">${info.emoji} ${title}</h3>
        <ul style="line-height: 1.6; list-style-type: none; padding-left: 0;">${list}</ul>
      </div>
    `;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5; text-align: center;">Tháng ${month} của gia đình ${familyName}</h2>
      <p>Gia đình chúng ta có <strong>${events.length} sự kiện</strong> sắp diễn ra trong tháng này:</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      ${sections}
      <br/>
      <p style="text-align: center; font-weight: bold;">Chúc gia đình một tháng mới tràn đầy niềm vui!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="text-align: center; color: #999; font-size: 12px;">Tin nhắn tự động từ Family Calendar</p>
    </div>
  `;
}

export function buildDailyEmailHtml(familyName: string, events: any[], specialMsg?: string): string {
  const specialHeader = specialMsg ? `
    <div style="margin-bottom: 25px; padding: 15px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; color: #92400e; text-align: center;">
      <span style="font-size: 1.2em;">🌟</span> <strong style="font-size: 1.1em;">${specialMsg}</strong>
    </div>
  ` : '';

  const categories = groupEventsByCategory(events);

  const sections = Object.entries(categories).map(([title, catEvents]) => {
    const info = getEventCategoryInfo(catEvents[0].type);
    const items = catEvents.map((event) => {
      const desc = event.description ? `<br/><span style="color: #666; font-size: 0.9em;">- ${event.description}</span>` : '';
      return `
        <div style="margin-bottom: 12px; padding: 12px; background: ${info.bgColor}; border-left: 4px solid ${info.color}; border-radius: 4px;">
          <strong style="color: #111827;">${event.title}</strong>
          ${desc}
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 20px;">
        <h3 style="color: ${info.color}; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
          ${info.emoji} ${title}
        </h3>
        ${items}
      </div>
    `;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981; text-align: center;">Chào ngày mới, gia đình ${familyName}!</h2>
      ${specialHeader}
      ${events.length > 0 ? '<p style="text-align: center;">Đừng quên hôm nay chúng ta có các sự kiện quan trọng sau:</p>' : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      ${sections}
      <br/>
      <p style="text-align: center; font-weight: bold;">Chúc đại gia đình một ngày tuyệt vời!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="text-align: center; color: #999; font-size: 12px;">Tin nhắn tự động từ Family Calendar</p>
    </div>
  `;
}

function groupEventsByCategory(events: any[]) {
  const categories: Record<string, any[]> = {};
  events.forEach((event) => {
    const info = getEventCategoryInfo(event.type);
    if (!categories[info.title]) categories[info.title] = [];
    categories[info.title].push(event);
  });
  return categories;
}
