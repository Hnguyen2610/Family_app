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
    return result.message || 'Khong the lay du lieu gia vang luc nay.';
  }

  const summary = result?.formatted_summary || 'Khong co du lieu gia vang.';
  const source = result?.source ? `\n\nNguon: ${result.source}` : '';
  const time = result?.api_time || result?.fetch_timestamp;

  return `${summary}${source}${time ? `\nCap nhat: ${time}` : ''}`;
}

export function formatMenuForUser(result: any): string {
  if (result?.error) {
    return result.message || 'Khong the tao thuc don luc nay.';
  }

  if (typeof result === 'string') return result;

  const parts = [];
  if (result?.mainDish) parts.push(`Mon chinh: ${formatMealName(result.mainDish)}`);
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
    return `Khong co su kien nao trong thang ${month}/${year}.`;
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
      : 'Chua ro ngay';
    const timeText = event?.time ? ` ${event.time}` : '';
    const familyText = event?.familyName ? ` - ${event.familyName}` : '';
    return `${index + 1}. ${dateText}${timeText}: ${event?.title || 'Su kien'}${familyText}`;
  });

  const hiddenCount = sorted.length - lines.length;
  const more = hiddenCount > 0 ? `\n...con ${hiddenCount} su kien khac.` : '';

  return `Sự kiện tháng ${month}/${year}:\n${lines.join('\n')}${more}`;
}
