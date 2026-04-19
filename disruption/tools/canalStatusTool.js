const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';

export async function checkSuezCanalStatus() {
  const p = new URLSearchParams({
    query: 'suez canal closure OR suez blocked OR suez suspended',
    mode: 'artlist', format: 'json', maxrecords: '5', sort: 'DateDesc',
  });
  try {
    const res = await fetch(`${GDELT}?${p}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { disrupted: false, note: `HTTP ${res.status}` };
    const text = await res.text();
    const json = JSON.parse(text);
    const arts = Array.isArray(json?.articles) ? json.articles : [];
    const disrupted = arts.some((a) => /closure|blocked|suspend|halt|stopp/i.test(a?.title || ''));
    return { disrupted, latestHeadline: arts[0]?.title || null, note: `checked ${arts.length} articles` };
  } catch {
    return { disrupted: false, note: 'suez check unavailable' };
  }
}

export async function checkPanamaWaterLevel() {
  const m = new Date().getMonth() + 1;
  const dry = m >= 1 && m <= 4;
  return {
    estimatedLevel: dry ? 25.8 : 27.2,
    draftRestricted: dry,
    note: dry ? 'Dry season; potential draft restrictions' : 'Normal seasonal operations',
  };
}
