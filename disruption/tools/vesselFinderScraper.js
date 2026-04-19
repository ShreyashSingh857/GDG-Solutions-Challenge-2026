import * as cheerio from 'cheerio';

import { politeFetch } from '../../shared/lib/scraper.js';

const VF_BASE = 'https://www.vesselfinder.com/vessels/details/';

export async function fetchVesselFromVesselFinder(mmsi) {
  const url = `${VF_BASE}${mmsi}`;

  const html = await politeFetch(url, {
    minIntervalMs: 10_000,
    cacheTtlMs: 20 * 60_000,
    headers: { Referer: 'https://www.google.com/' },
  });

  const $ = cheerio.load(html);

  const data = {};
  $('.tparams tr').each((_, row) => {
    const key = $(row).find('td').first().text().trim().toLowerCase().replace(/\s+/g, '_');
    const value = $(row).find('td').last().text().trim();
    if (key && value) data[key] = value;
  });

  const jsonLd = $('script[type="application/ld+json"]').first().html();
  let structured = {};
  if (jsonLd) {
    try {
      structured = JSON.parse(jsonLd);
    } catch {
      structured = {};
    }
  }

  return {
    mmsi,
    name: structured.name || $('h1').first().text().split('-')[0]?.trim() || 'Unknown',
    flag: data.flag || null,
    type: data.vessel_type || data.type_of_vessel || null,
    speed: Number.parseFloat(data.speed) || null,
    course: Number.parseFloat(data.course) || null,
    destination: data.destination || null,
    draught: Number.parseFloat(data.draught) || null,
    lat: Number.parseFloat(data.latitude) || null,
    lng: Number.parseFloat(data.longitude) || null,
    status: data.navigational_status || null,
    scrapedAt: new Date().toISOString(),
    source: 'VesselFinder',
  };
}
