/**
 * Shared helper: fetch gold price from external API.
 * Used by MarketSkill. Extracted to avoid duplicating fetch logic.
 */
export async function fetchGoldPrice(): Promise<any> {
  const axios = await import('axios');
  const https = await import('node:https');

  const response = await axios.default.get('https://giavang.now/api/prices', {
    timeout: 10000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.data?.success || !response.data?.prices) {
    return { error: true, message: 'Không thể lấy được dữ liệu từ máy chủ giá vàng.' };
  }

  const prices = response.data.prices;
  const fmt = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
  const { SJL1L10: sjc, XAUUSD: xau, SJ9999: ring, DOHNL: dojiHn, PQHNVM: pnjHn } = prices;

  const summaryParts: string[] = [];
  if (sjc) {
    summaryParts.push(
      `- Vàng SJC 9999: Mua ${fmt(sjc.buy)} / Bán ${fmt(sjc.sell)} VND/lượng (${sjc.change_buy >= 0 ? '+' : ''}${fmt(sjc.change_buy)} VND)`
    );
  }
  if (dojiHn) {
    summaryParts.push(`- Vàng DOJI Ha Noi: Mua ${fmt(dojiHn.buy)} / Bán ${fmt(dojiHn.sell)} VND/lượng`);
  }
  if (pnjHn) {
    summaryParts.push(`- Vàng PNJ Ha Noi: Mua ${fmt(pnjHn.buy)} / Bán ${fmt(pnjHn.sell)} VND/lượng`);
  }
  if (ring) {
    summaryParts.push(`- Vàng nhẫn SJC: Mua ${fmt(ring.buy)} / Bán ${fmt(ring.sell)} VND/lượng`);
  }
  if (xau) summaryParts.push(`- Vàng thế giới (XAUUSD): ${xau.buy} USD/oz`);

  return {
    formatted_summary: summaryParts.join('\n'),
    sjc_buy: sjc ? `${fmt(sjc.buy)} VND/lượng` : 'N/A',
    sjc_sell: sjc ? `${fmt(sjc.sell)} VND/lượng` : 'N/A',
    sjc_change: sjc ? `${sjc.change_buy >= 0 ? '+' : ''}${fmt(sjc.change_buy)} VND` : 'N/A',
    nhan_sjc_buy: ring ? `${fmt(ring.buy)} VND/lượng` : 'N/A',
    nhan_sjc_sell: ring ? `${fmt(ring.sell)} VND/lượng` : 'N/A',
    world_gold_usd: xau ? `${xau.buy} USD/oz` : 'N/A',
    source: 'giavang.now',
    api_date: response.data.date,
    api_time: response.data.time,
    fetch_timestamp: new Date().toISOString(),
  };
}
