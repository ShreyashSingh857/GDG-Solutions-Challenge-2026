import * as cheerio from 'cheerio';

import { politeFetch } from '../shared/lib/scraper.js';

const MT_BASE = 'https://www.marinetraffic.com/en/ais/details/ships/mmsi';

export async function fetchVesselDetails(mmsi) {
  const url = `${MT_BASE}:${mmsi}`;

  const html = await politeFetch(url, {
    minIntervalMs: 10_000,
    cacheTtlMs: 30 * 60_000,
    headers: {
      Referer: 'https://www.google.com/',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    },
  });

  const $ = cheerio.load(html);

  const jsonLdBlock = $('script[type="application/ld+json"]').first().html();
  let structured = null;
  if (jsonLdBlock) {
    try {
      structured = JSON.parse(jsonLdBlock);
    } catch {
      structured = null;
    }
  }

  const vesselName = $('meta[property="og:title"]').attr('content')?.split('|')[0]?.trim()
    || structured?.name
    || 'Unknown';
  const description = $('meta[property="og:description"]').attr('content') || '';

  const imoMatch = description.match(/IMO:\s*(\d{7})/i);
  const typeMatch = description.match(/is\s+a\s+([^,\.]+)/i);
  const speedMatch = description.match(/speed\s+of\s+([\d.]+)\s*kn/i);
  const destMatch = description.match(/destination\s+([^\.]+?)\s+and\s+ETA/i);
  const etaMatch = description.match(/ETA\s+([^\.]+)\./i);
  const statusMatch = description.match(/(underway|at anchor|moored|aground|not under command)/i);

  const latMatch = html.match(/"latitude"\s*:\s*([-\d.]+)/);
  const lngMatch = html.match(/"longitude"\s*:\s*([-\d.]+)/);

  return {
    mmsi,
    imo: imoMatch?.[1] || null,
    name: vesselName,
    type: typeMatch?.[1]?.trim() || null,
    speed: speedMatch ? Number.parseFloat(speedMatch[1]) : null,
    destination: destMatch?.[1]?.trim() || null,
    eta: etaMatch?.[1]?.trim() || null,
    navStatus: statusMatch?.[1] || null,
    lat: latMatch ? Number.parseFloat(latMatch[1]) : null,
    lng: lngMatch ? Number.parseFloat(lngMatch[1]) : null,
    sourceUrl: url,
    scrapedAt: new Date().toISOString(),
  };
}

export async function fetchVesselsInPort(portName) {
  const searchUrl = `https://www.marinetraffic.com/en/ais/index/ports/all/flag:0/term:${encodeURIComponent(portName)}`;

  const html = await politeFetch(searchUrl, {
    minIntervalMs: 15_000,
    cacheTtlMs: 60 * 60_000,
  });

  const $ = cheerio.load(html);
  const vessels = [];

  $('table.vessels-table tr, table[class*="vessel"] tr').each((i, row) => {
    if (i === 0) return;

    const cells = $(row).find('td');
    if (cells.length < 4) return;

    vessels.push({
      name: $(cells[0]).text().trim(),
      flag: $(cells[1]).text().trim(),
      type: $(cells[2]).text().trim(),
      arrivalTime: $(cells[3]).text().trim(),
    });
  });

  return {
    portName,
    vesselCount: vessels.length,
    vessels: vessels.slice(0, 50),
  };
}
