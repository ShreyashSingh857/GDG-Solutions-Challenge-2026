import * as cheerio from 'cheerio';
import { politeFetch } from '../shared/lib/scraper.js';

const SUEZ_VESSEL_URL =
  'https://suezcanal.net.eg/English/Navigation/Pages/VesselMovement.aspx';

const SUEZ_NEWS_URL =
  'https://suezcanal.net.eg/English/Media/Pages/PressReleases.aspx';

export async function fetchSuezVesselMovement() {
  const html = await politeFetch(SUEZ_VESSEL_URL, {
    minIntervalMs: 10_000,
    cacheTtlMs: 30 * 60_000,
  });

  const $ = cheerio.load(html);
  const vessels = [];
  let northboundCount = 0;
  let southboundCount = 0;

  $('table tr').each((i, row) => {
    if (i === 0) return;
    const cells = $(row).find('td, th');
    if (cells.length < 4) return;

    const name = $(cells[0]).text().trim();
    const type = $(cells[1]).text().trim();
    const flag = $(cells[2]).text().trim();
    const direction = $(cells[3]).text().trim().toUpperCase();
    const draught = parseFloat($(cells[4])?.text()) || null;

    if (!name || name.length < 2) return;

    const isNorth = direction.startsWith('N');
    if (isNorth) northboundCount++;
    else southboundCount++;

    vessels.push({
      name,
      type,
      flag,
      direction: isNorth ? 'northbound' : 'southbound',
      draught,
    });
  });

  const totalVessels = northboundCount + southboundCount;
  const isSuspended = totalVessels < 10;
  const isRestricted = totalVessels < 25;

  return {
    vessels,
    northboundCount,
    southboundCount,
    totalTransiting: totalVessels,
    statusAssessment: isSuspended
      ? 'LIKELY_SUSPENDED'
      : isRestricted
        ? 'LIKELY_RESTRICTED'
        : 'NORMAL_OPERATIONS',
    scrapedAt: new Date().toISOString(),
  };
}

export async function fetchSuezPressReleases() {
  const html = await politeFetch(SUEZ_NEWS_URL, {
    minIntervalMs: 15_000,
    cacheTtlMs: 60 * 60_000,
  });

  const $ = cheerio.load(html);
  const releases = [];

  $('div.ms-rtestate-field a, .release-item a, ul.dfwp-list li a').each((_, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href');
    if (!title || title.length < 5) return;

    const closureKeywords = ['closure', 'suspend', 'halt', 'block', 'restricted', 'emergency'];
    const isAlert = closureKeywords.some((kw) => title.toLowerCase().includes(kw));

    releases.push({
      title,
      url: href ? new URL(href, SUEZ_NEWS_URL).toString() : null,
      isAlert,
      source: 'Suez Canal Authority',
    });
  });

  return releases;
}

export async function assessSuezCanalStatus() {
  const [movement, pressReleases] = await Promise.allSettled([
    fetchSuezVesselMovement(),
    fetchSuezPressReleases(),
  ]);

  const mv = movement.status === 'fulfilled' ? movement.value : null;
  const pr = pressReleases.status === 'fulfilled'
    ? pressReleases.value.filter((r) => r.isAlert)
    : [];

  const isDisrupted =
    mv?.statusAssessment === 'LIKELY_SUSPENDED' ||
    mv?.statusAssessment === 'LIKELY_RESTRICTED' ||
    pr.length > 0;

  return {
    isDisrupted,
    vesselData: mv,
    alertReleases: pr,
    summary: isDisrupted
      ? `Suez Canal disruption detected: ${mv?.totalTransiting ?? '?'} vessels in transit (normal ~50). ${pr[0]?.title || ''}`
      : `Suez Canal normal: ${mv?.totalTransiting ?? '?'} vessels transiting`,
  };
}