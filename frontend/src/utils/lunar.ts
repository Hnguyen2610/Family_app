import { Lunar } from 'lunar-calendar-ts-vi';

const lunarEngine = new Lunar();

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
}

export function getLunarDate(d: number, m: number, y: number): LunarDate {
  try {
    const lunar = lunarEngine.getLunarDate(d, m, y);
    return {
      day: lunar.day,
      month: lunar.month,
      year: lunar.year,
      isLeap: !!lunar.leap
    };
  } catch (error) {
    console.error('Error calculating lunar date:', error);
    return { day: 1, month: 1, year: 1970, isLeap: false };
  }
}

export function formatLunarDate(date: LunarDate): string {
  return `${date.day}/${date.month}`;
}
