import { Lunar } from 'lunar-calendar-ts-vi';

const lunarEngine = new Lunar();

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
}

export function calculateLunarDate(solarDate: Date): string {
  try {
    const d = solarDate.getDate();
    const m = solarDate.getMonth() + 1;
    const y = solarDate.getFullYear();
    const lunar = lunarEngine.getLunarDate(d, m, y);
    return `${lunar.day}/${lunar.month}`;
  } catch (error) {
    console.error('Error calculating lunar date:', error);
    return '';
  }
}

export function getLunarDateObject(solarDate: Date): LunarDate {
  try {
    const d = solarDate.getDate();
    const m = solarDate.getMonth() + 1;
    const y = solarDate.getFullYear();
    const lunar = lunarEngine.getLunarDate(d, m, y);
    return { day: lunar.day, month: lunar.month, year: lunar.year, isLeap: !!lunar.leap };
  } catch (error) {
    console.error('Error building lunar date:', error);
    return { day: 1, month: 1, year: 1970, isLeap: false };
  }
}

export function parseDateString(dateStr: string): Date {
  // Assuming DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JS
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(); // Fallback to current date
}

export function getSolarDateFromLunar(lunarDay: number, lunarMonth: number, year: number): Date | null {
  try {
    // Search within the specified year (approximate range)
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const lunar = lunarEngine.getLunarDate(d.getDate(), d.getMonth() + 1, d.getFullYear());
      if (lunar.day === lunarDay && lunar.month === lunarMonth) {
        return new Date(d);
      }
    }
  } catch (error) {
    console.error('Error finding solar date from lunar:', error);
  }
  return null;
}
