import * as cheerio from 'cheerio';
import { politeFetch } from '../shared/lib/scraper.js';

const PANCANAL_STATS_URL = 'https://www.pancanal.com/eng/op/transit-stats/index.html';
const PANCANAL_WATER_URL = 'https://www.pancanal.com/eng/op/Gatun_level.html';

export async function fetchPanamaTransitStats() {
  const html = await politeFetch(PANCANAL_STATS_URL, {
    minIntervalMs: 15_000,
    cacheTtlMs: 6 * 60 * 60_000,
  });

  const $ = cheerio.load(html);
  const stats = {};

  $('table').first().find('tr').each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim().toLowerCase().replace(/\s+/g, '_');
    const value = $(cells[1]).text().trim();
    if (label) stats[label] = value;
  });

  const pageText = $('body').text().toLowerCase();
  const draftRestricted = pageText.includes('draft restriction') ||
    pageText.includes('maximum authorized draft') ||
    pageText.includes('reduced draft');
  const draftValueMatch = pageText.match(/maximum\s+authorized\s+draft[:\s]+([\d.]+)\s*(?:feet|ft|m)/i);

  return {
    stats,
    draftRestricted,
    currentMaxDraftFt: draftValueMatch ? parseFloat(draftValueMatch[1]) : null,
    normalMaxDraftFt: 50,
    scrapedAt: new Date().toISOString(),
  };
}

export async function fetchGatunLakeLevel() {
  try {
    const html = await politeFetch(PANCANAL_WATER_URL, {
      minIntervalMs: 20_000,
      cacheTtlMs: 2 * 60 * 60_000,
    });

    const $ = cheerio.load(html);
    const levelText = $('body').text().match(/([\d.]+)\s*(?:feet|ft)/i);
    const levelFt = levelText ? parseFloat(levelText[1]) : null;

    const status =
      levelFt === null ? 'UNKNOWN'
      : levelFt < 75 ? 'CRITICAL_RESTRICTION'
      : levelFt < 80 ? 'DRAFT_RESTRICTION'
      : levelFt < 84 ? 'ADVISORY'
      : 'NORMAL';

    return {
      levelFt,
      levelM: levelFt ? (levelFt * 0.3048).toFixed(2) : null,
      status,
      alert: status !== 'NORMAL',
      message: status === 'CRITICAL_RESTRICTION'
        ? `Gatun Lake at ${levelFt} ft - critical draft restrictions in effect`
        : status === 'DRAFT_RESTRICTION'
          ? `Gatun Lake at ${levelFt} ft - draft restrictions apply`
          : `Gatun Lake at ${levelFt} ft - normal operations`,
    };
  } catch {
    const month = new Date().getMonth() + 1;
    const isDrySeason = month >= 1 && month <= 4;

    return {
      levelFt: isDrySeason ? 79.5 : 85.2,
      status: isDrySeason ? 'DRAFT_RESTRICTION' : 'NORMAL',
      alert: isDrySeason,
      message: isDrySeason
        ? 'Dry season estimate - draft restrictions likely'
        : 'Wet season estimate - normal operations',
      estimated: true,
    };
  }
}

export async function assessPanamaStatus() {
  const [stats, water] = await Promise.allSettled([
    fetchPanamaTransitStats(),
    fetchGatunLakeLevel(),
  ]);

  const s = stats.status === 'fulfilled' ? stats.value : null;
  const w = water.status === 'fulfilled' ? water.value : null;
  const isDisrupted = Boolean(s?.draftRestricted || w?.alert);

  return {
    isDisrupted,
    stats: s,
    waterLevel: w,
    summary: isDisrupted
      ? `Panama Canal disruption: ${w?.message || s?.stats?.current_draft_restriction || 'Restrictions in effect'}`
      : 'Panama Canal normal operations',
  };
}