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

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const CON_GIAP = ['Chuột', 'Trâu', 'Hổ', 'Mèo', 'Rồng', 'Rắn', 'Ngựa', 'Dê', 'Khỉ', 'Gà', 'Chó', 'Lợn'];
// Nạp Âm five-element cycle: sum of Can-group (1-5) + Chi-group (0-2), wrapped back into 1-5.
const MENH_NGU_HANH = ['Kim', 'Thủy', 'Hỏa', 'Thổ', 'Mộc'];

export interface ZodiacYearInfo {
  canChi: string;
  conGiap: string;
  menhNguHanh: string;
}

/**
 * Can-Chi year name, 12-year zodiac animal, and Nạp Âm five-element (mệnh) for a lunar year.
 * Computed deterministically instead of left for the model to infer, since LLMs are unreliable
 * at Can-Chi/Nạp Âm arithmetic and mixing up solar vs. lunar year.
 */
export function getZodiacYearInfo(lunarYear: number): ZodiacYearInfo {
  const canIndex = (((lunarYear - 4) % 10) + 10) % 10;
  const chiIndex = (((lunarYear - 4) % 12) + 12) % 12;

  const canValue = Math.floor(canIndex / 2) + 1; // Giáp/Ất=1 ... Nhâm/Quý=5
  const chiValue = Math.floor((chiIndex % 6) / 2); // Tý/Sửu/Ngọ/Mùi=0, Dần/Mão/Thân/Dậu=1, Thìn/Tỵ/Tuất/Hợi=2
  const sum = canValue + chiValue > 5 ? canValue + chiValue - 5 : canValue + chiValue;

  return {
    canChi: `${CAN[canIndex]} ${CHI[chiIndex]}`,
    conGiap: CON_GIAP[chiIndex],
    menhNguHanh: MENH_NGU_HANH[sum - 1],
  };
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
