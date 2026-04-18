const COMTRADE_BASE = 'https://comtradeapi.un.org/data/v1/get';

const COUNTRY_TO_ISO3 = {
  usa: 'USA', china: 'CHN', japan: 'JPN', india: 'IND', germany: 'DEU',
  singapore: 'SGP', netherlands: 'NLD', uae: 'ARE', korea: 'KOR',
};

function inferIso3(value) {
  const raw = String(value || '').trim();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return COUNTRY_TO_ISO3[raw.toLowerCase()] || null;
}

export async function getTradeWeight(origin, destination, cmdCode = 'TOTAL') {
  if (!process.env.UN_COMTRADE_KEY) return { weight: 1.0, note: 'no key' };

  const reporter = inferIso3(origin);
  const partner = inferIso3(destination);
  if (!reporter || !partner) return { weight: 1.0, note: 'unknown country codes' };

  const params = new URLSearchParams({
    frequency: 'A',
    clCode: 'HS',
    reporterCode: reporter,
    partnerCode: partner,
    cmdCode,
    period: String(new Date().getUTCFullYear() - 1),
  });

  try {
    const res = await fetch(`${COMTRADE_BASE}/C/A/HS?${params}`, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.UN_COMTRADE_KEY },
    });
    if (!res.ok) return { weight: 1.0, note: `http_${res.status}` };
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const total = rows.reduce((sum, row) => sum + Number(row?.primaryValue || 0), 0);
    if (!total) return { weight: 1.0, note: 'no trade rows' };
    const weight = Math.min(Math.max(total / 5_000_000_000, 0.7), 1.6);
    return { weight, note: 'ok' };
  } catch (err) {
    return { weight: 1.0, note: `error_${err.message}` };
  }
}
