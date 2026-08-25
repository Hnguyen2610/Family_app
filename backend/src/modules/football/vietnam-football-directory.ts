const COUNTRY_NAMES_VI: Record<string, string> = {
  vietnam: 'Việt Nam',
  thailand: 'Thái Lan',
  indonesia: 'Indonesia',
  malaysia: 'Malaysia',
  singapore: 'Singapore',
  philippines: 'Philippines',
  myanmar: 'Myanmar',
  cambodia: 'Campuchia',
  laos: 'Lào',
  brunei: 'Brunei',
  'timor-leste': 'Đông Timor',
  'south korea': 'Hàn Quốc',
  japan: 'Nhật Bản',
  china: 'Trung Quốc',
  iraq: 'Iraq',
  'saudi arabia': 'Ả Rập Xê Út',
  australia: 'Úc',
  'united arab emirates': 'UAE',
  qatar: 'Qatar',
  oman: 'Oman',
  yemen: 'Yemen',
  syria: 'Syria',
  jordan: 'Jordan',
  lebanon: 'Liban',
  kuwait: 'Kuwait',
  bahrain: 'Bahrain',
  uzbekistan: 'Uzbekistan',
  'north korea': 'Triều Tiên',
  'hong kong': 'Hồng Kông',
  'chinese taipei': 'Đài Loan',
  india: 'Ấn Độ',
};

export function translateCountryName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return trimmed;
  return COUNTRY_NAMES_VI[trimmed.toLowerCase()] || trimmed;
}
