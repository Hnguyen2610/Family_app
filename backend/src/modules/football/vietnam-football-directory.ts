// Static directory mapping scraped Vietnamese football team names to their official
// display name and crest. football-data.org has no V-League/Vietnam NT coverage, so
// matches for those competitions are extracted from free-text search results (see
// football.service.ts) and need this lookup to get a real name + logo instead of
// whatever fragment the text extraction produced.
type VietnamFootballEntry = {
  canonicalName: string;
  crestUrl: string;
  aliases: string[];
};

const WIKIMEDIA_VI = 'https://upload.wikimedia.org/wikipedia/vi';
const FLAGCDN = 'https://flagcdn.com/w80';

export function normalizeVietnameseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// V-League 1 2025-26 clubs. Aliases are kept unambiguous on purpose (e.g. bare "ha noi"
// is never used, since it collides with both "Hà Nội FC" and "Công An Hà Nội") — a name
// that doesn't clearly resolve should fall through to no-match rather than guess wrong.
export const VIETNAM_CLUBS: VietnamFootballEntry[] = [
  {
    canonicalName: 'Becamex Thành Phố Hồ Chí Minh',
    crestUrl: `${WIKIMEDIA_VI}/3/35/Logo_CLB_Becamex_TP.HCM.png`,
    aliases: ['becamex tp hcm', 'becamex tphcm', 'becamex ho chi minh', 'becamex'],
  },
  {
    canonicalName: 'Công An Hà Nội',
    crestUrl: `${WIKIMEDIA_VI}/3/38/Logo_CAHN_FC.svg`,
    aliases: ['cong an ha noi', 'ca ha noi', 'cahn'],
  },
  {
    canonicalName: 'Công An Thành Phố Hồ Chí Minh',
    crestUrl: `${WIKIMEDIA_VI}/4/47/Logo_of_Cong_An_Ho_Chi_Minh_City_football_club%2C_from_Ho_Chi_Minh_City%2C_from_2025.svg`,
    aliases: ['cong an tp hcm', 'cong an tphcm', 'cong an ho chi minh'],
  },
  {
    canonicalName: 'Đông Á Thanh Hóa',
    crestUrl: `${WIKIMEDIA_VI}/1/15/Logo_CLB_Thanh_H%C3%B3a_%282026%29.png`,
    aliases: ['dong a thanh hoa', 'thanh hoa'],
  },
  {
    canonicalName: 'Hải Phòng',
    crestUrl: `${WIKIMEDIA_VI}/2/21/H%E1%BA%A3i_Ph%C3%B2ng_FC_2021.svg`,
    aliases: ['hai phong'],
  },
  {
    canonicalName: 'Hà Nội FC',
    crestUrl: `${WIKIMEDIA_VI}/0/0d/Logo_HN_FC.svg`,
    aliases: ['ha noi fc', 'clb ha noi'],
  },
  {
    canonicalName: 'Thể Công – Viettel',
    crestUrl: `${WIKIMEDIA_VI}/8/80/Logo_CLB_TC-VT.svg`,
    aliases: ['the cong viettel', 'the cong', 'viettel fc', 'viettel'],
  },
  {
    canonicalName: 'Hoàng Anh Gia Lai',
    crestUrl: `${WIKIMEDIA_VI}/0/0d/Ho%C3%A0ng_Anh_Gia_Lai_FC.png`,
    aliases: ['hoang anh gia lai', 'hagl'],
  },
  {
    canonicalName: 'Hồng Lĩnh Hà Tĩnh',
    crestUrl: `${WIKIMEDIA_VI}/2/22/HLHT_FC.svg`,
    aliases: ['hong linh ha tinh', 'ha tinh'],
  },
  {
    canonicalName: 'Ninh Bình',
    crestUrl: `${WIKIMEDIA_VI}/3/3d/Logo_CLB_Ninh_B%C3%ACnh.png`,
    aliases: ['ninh binh'],
  },
  {
    canonicalName: 'Thép Xanh Nam Định',
    crestUrl: `${WIKIMEDIA_VI}/4/40/Logo_CLB_TXN%C4%90_%283_sao%29.png`,
    aliases: ['thep xanh nam dinh', 'nam dinh'],
  },
  {
    canonicalName: 'PVF-CAND',
    crestUrl: `${WIKIMEDIA_VI}/7/7b/Logo_CLB_C%C3%B4ng_an_nh%C3%A2n_d%C3%A2n_%282026%29.png`,
    aliases: ['pvf cand', 'cong an nhan dan', 'cand'],
  },
  {
    canonicalName: 'SHB Đà Nẵng',
    crestUrl: `${WIKIMEDIA_VI}/d/d2/Logo_CLB_SHB_%C4%90%C3%A0_N%E1%BA%B5ng_%282026%29.png`,
    aliases: ['shb da nang', 'da nang'],
  },
  {
    canonicalName: 'Sông Lam Nghệ An',
    crestUrl: `${WIKIMEDIA_VI}/b/bd/SLNA_FC_2022.svg`,
    aliases: ['song lam nghe an', 'nghe an', 'slna'],
  },
];

export const VIETNAM_NATIONAL_TEAM: VietnamFootballEntry = {
  canonicalName: 'Đội Tuyển Việt Nam',
  crestUrl: `${WIKIMEDIA_VI}/0/07/Vietnam_national_football_team_logo.png`,
  aliases: ['doi tuyen viet nam', 'tuyen viet nam', 'viet nam', 'vietnam', 'u23 viet nam', 'u22 viet nam'],
};

// Common opponents in ASEAN Cup / World Cup & Asian Cup qualifying. Anything not listed
// here simply falls through to the default shield icon in the UI — this list doesn't
// need to be exhaustive to be useful.
export const COUNTRY_FLAGS: VietnamFootballEntry[] = [
  { canonicalName: 'Thái Lan', crestUrl: `${FLAGCDN}/th.png`, aliases: ['thai lan', 'thailand'] },
  { canonicalName: 'Indonesia', crestUrl: `${FLAGCDN}/id.png`, aliases: ['indonesia'] },
  { canonicalName: 'Malaysia', crestUrl: `${FLAGCDN}/my.png`, aliases: ['malaysia'] },
  { canonicalName: 'Singapore', crestUrl: `${FLAGCDN}/sg.png`, aliases: ['singapore'] },
  { canonicalName: 'Philippines', crestUrl: `${FLAGCDN}/ph.png`, aliases: ['philippines', 'philippin'] },
  { canonicalName: 'Myanmar', crestUrl: `${FLAGCDN}/mm.png`, aliases: ['myanmar'] },
  { canonicalName: 'Campuchia', crestUrl: `${FLAGCDN}/kh.png`, aliases: ['campuchia', 'cambodia'] },
  { canonicalName: 'Lào', crestUrl: `${FLAGCDN}/la.png`, aliases: ['lao', 'laos'] },
  { canonicalName: 'Brunei', crestUrl: `${FLAGCDN}/bn.png`, aliases: ['brunei'] },
  { canonicalName: 'Đông Timor', crestUrl: `${FLAGCDN}/tl.png`, aliases: ['dong timor', 'timor leste'] },
  { canonicalName: 'Hàn Quốc', crestUrl: `${FLAGCDN}/kr.png`, aliases: ['han quoc', 'south korea', 'korea republic'] },
  { canonicalName: 'Nhật Bản', crestUrl: `${FLAGCDN}/jp.png`, aliases: ['nhat ban', 'japan'] },
  { canonicalName: 'Trung Quốc', crestUrl: `${FLAGCDN}/cn.png`, aliases: ['trung quoc', 'china'] },
  { canonicalName: 'Iraq', crestUrl: `${FLAGCDN}/iq.png`, aliases: ['iraq'] },
  { canonicalName: 'Ả Rập Xê Út', crestUrl: `${FLAGCDN}/sa.png`, aliases: ['a rap xe ut', 'saudi arabia'] },
  { canonicalName: 'Úc', crestUrl: `${FLAGCDN}/au.png`, aliases: ['australia'] },
  { canonicalName: 'UAE', crestUrl: `${FLAGCDN}/ae.png`, aliases: ['uae', 'united arab emirates'] },
  { canonicalName: 'Qatar', crestUrl: `${FLAGCDN}/qa.png`, aliases: ['qatar'] },
  { canonicalName: 'Oman', crestUrl: `${FLAGCDN}/om.png`, aliases: ['oman'] },
  { canonicalName: 'Yemen', crestUrl: `${FLAGCDN}/ye.png`, aliases: ['yemen'] },
  { canonicalName: 'Syria', crestUrl: `${FLAGCDN}/sy.png`, aliases: ['syria'] },
  { canonicalName: 'Jordan', crestUrl: `${FLAGCDN}/jo.png`, aliases: ['jordan'] },
  { canonicalName: 'Liban', crestUrl: `${FLAGCDN}/lb.png`, aliases: ['liban', 'lebanon'] },
  { canonicalName: 'Kuwait', crestUrl: `${FLAGCDN}/kw.png`, aliases: ['kuwait'] },
  { canonicalName: 'Bahrain', crestUrl: `${FLAGCDN}/bh.png`, aliases: ['bahrain'] },
  { canonicalName: 'Uzbekistan', crestUrl: `${FLAGCDN}/uz.png`, aliases: ['uzbekistan'] },
  { canonicalName: 'Triều Tiên', crestUrl: `${FLAGCDN}/kp.png`, aliases: ['trieu tien', 'north korea', 'korea dpr'] },
  { canonicalName: 'Hồng Kông', crestUrl: `${FLAGCDN}/hk.png`, aliases: ['hong kong'] },
  { canonicalName: 'Đài Loan', crestUrl: `${FLAGCDN}/tw.png`, aliases: ['dai loan', 'chinese taipei'] },
  { canonicalName: 'Ấn Độ', crestUrl: `${FLAGCDN}/in.png`, aliases: ['an do', 'india'] },
];

function matchesAlias(normalizedName: string, alias: string): boolean {
  return ` ${normalizedName} `.includes(` ${alias} `);
}

function findEntry(normalizedName: string, entries: VietnamFootballEntry[]): VietnamFootballEntry | null {
  if (!normalizedName) return null;
  return entries.find((entry) => entry.aliases.some((alias) => matchesAlias(normalizedName, alias))) || null;
}

export function resolveVietnamTeam(
  rawName: string,
  code: 'VLEAGUE' | 'VIETNAM',
): { name: string; crestUrl: string | null } {
  const normalized = normalizeVietnameseText(rawName);

  if (code === 'VLEAGUE') {
    const club = findEntry(normalized, VIETNAM_CLUBS);
    return club ? { name: club.canonicalName, crestUrl: club.crestUrl } : { name: rawName, crestUrl: null };
  }

  if (findEntry(normalized, [VIETNAM_NATIONAL_TEAM])) {
    return { name: VIETNAM_NATIONAL_TEAM.canonicalName, crestUrl: VIETNAM_NATIONAL_TEAM.crestUrl };
  }
  const country = findEntry(normalized, COUNTRY_FLAGS);
  return country ? { name: country.canonicalName, crestUrl: country.crestUrl } : { name: rawName, crestUrl: null };
}
