export const ICT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function getIctNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: ICT_TIME_ZONE }));
}

export function getIctDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ICT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function startOfIctDay(date: Date) {
  const [year, month, day] = getIctDateKey(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIctDate(date: Date) {
  return date.toLocaleDateString('vi-VN', { timeZone: ICT_TIME_ZONE });
}
