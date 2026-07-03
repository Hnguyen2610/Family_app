export type StructuredToolResult<T = any> = {
  ok: boolean;
  tool: string;
  data?: T;
  error?: {
    message: string;
  };
};

export function toolSuccess<T>(tool: string, data: T): StructuredToolResult<T> {
  return { ok: true, tool, data };
}

export function toolError(tool: string, message: string): StructuredToolResult {
  return {
    ok: false,
    tool,
    error: { message },
  };
}

export function formatGoldPriceForUser(result: any): string {
  if (result?.error) {
    return result.message || 'Không thể lấy dữ liệu giá vàng lúc này.';
  }

  const summary = result?.formatted_summary || 'Không có dữ liệu giá vàng.';
  const source = result?.source ? `\n\nNguồn: ${result.source}` : '';
  const time = result?.api_time || result?.fetch_timestamp;

  return `${summary}${source}${time ? `\nCập nhật: ${time}` : ''}`;
}

export function formatMenuForUser(result: any): string {
  if (result?.error) {
    return result.message || 'Không thể tạo thực đơn lúc này.';
  }

  if (typeof result === 'string') return result;

  const parts = [];
  if (result?.mainDish) parts.push(`Món chính: ${formatMealName(result.mainDish)}`);
  if (result?.vegetable) parts.push(`Rau: ${formatMealName(result.vegetable)}`);
  if (result?.soup) parts.push(`Canh: ${formatMealName(result.soup)}`);
  if (result?.formatted) parts.push(result.formatted);

  return parts.length ? parts.join('\n') : JSON.stringify(result, null, 2);
}

function formatMealName(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.title || value.meal?.name || JSON.stringify(value);
}

export function formatCalendarEventsForUser(events: any[], month: number, year: number): string {
  if (!Array.isArray(events) || events.length === 0) {
    return `Không có sự kiện nào trong tháng ${month}/${year}.`;
  }

  const sorted = [...events].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return aTime - bTime;
  });

  const lines = sorted.slice(0, 12).map((event, index) => {
    const date = event?.date ? new Date(event.date) : undefined;
    const dateText = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('vi-VN')
      : 'Chưa rõ ngày';
    const timeText = event?.time ? ` ${event.time}` : '';
    const familyText = event?.familyName ? ` - ${event.familyName}` : '';
    return `${index + 1}. ${dateText}${timeText}: ${event?.title || 'Sự kiện'}${familyText}`;
  });

  const hiddenCount = sorted.length - lines.length;
  const more = hiddenCount > 0 ? `\n...còn ${hiddenCount} sự kiện khác.` : '';

  return `Sự kiện tháng ${month}/${year}:\n${lines.join('\n')}${more}`;
}
