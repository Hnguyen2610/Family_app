import { getZodiacYearInfo } from './lunar-calendar.util';

describe('getZodiacYearInfo', () => {
  // Reference points from the standard Lục Thập Hoa Giáp (Nạp Âm) table.
  it('resolves Giáp Tý (1984, 2044...) to Kim', () => {
    expect(getZodiacYearInfo(1984)).toEqual({
      canChi: 'Giáp Tý',
      conGiap: 'Chuột',
      menhNguHanh: 'Kim',
    });
  });

  it('resolves Bính Dần to Hỏa', () => {
    expect(getZodiacYearInfo(1986)).toEqual({
      canChi: 'Bính Dần',
      conGiap: 'Hổ',
      menhNguHanh: 'Hỏa',
    });
  });

  it('resolves Mậu Thìn to Mộc', () => {
    expect(getZodiacYearInfo(1988)).toEqual({
      canChi: 'Mậu Thìn',
      conGiap: 'Rồng',
      menhNguHanh: 'Mộc',
    });
  });

  it('resolves Canh Ngọ to Thổ', () => {
    expect(getZodiacYearInfo(1990)).toEqual({
      canChi: 'Canh Ngọ',
      conGiap: 'Ngựa',
      menhNguHanh: 'Thổ',
    });
  });

  it('resolves Nhâm Thân to Kim (sum wraps past 5)', () => {
    expect(getZodiacYearInfo(1992)).toEqual({
      canChi: 'Nhâm Thân',
      conGiap: 'Khỉ',
      menhNguHanh: 'Kim',
    });
  });

  it('resolves Giáp Thìn (2024) to Hỏa', () => {
    expect(getZodiacYearInfo(2024)).toEqual({
      canChi: 'Giáp Thìn',
      conGiap: 'Rồng',
      menhNguHanh: 'Hỏa',
    });
  });

  it('handles years before the 1984 epoch correctly (negative modulo)', () => {
    expect(getZodiacYearInfo(1900)).toEqual({
      canChi: 'Canh Tý',
      conGiap: 'Chuột',
      menhNguHanh: 'Thổ',
    });
  });
});
