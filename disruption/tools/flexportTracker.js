import { scrapeWithJs } from '../../shared/lib/headlessBrowser.js';

export async function fetchFlexportTracking(trackingNumber, opts = {}) {
  const scraper = opts.scraper || scrapeWithJs;
  const url = `https://www.flexport.com/tracking/${encodeURIComponent(trackingNumber)}`;
  const extractTrackingData = () => {
    /* eslint-disable no-undef */
    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
    const getAll = (sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.trim());

    return {
      status: getText('[class*="status"], [data-testid*="status"]'),
      origin: getText('[class*="origin"], [data-testid*="origin"]'),
      destination: getText('[class*="destination"], [data-testid*="destination"]'),
      eta: getText('[class*="eta"], [class*="arrival"]'),
      lastEvent: getText('[class*="last-event"], [class*="latest-update"]'),
      allEvents: getAll('[class*="event-row"], [class*="milestone"]'),
      carrier: getText('[class*="carrier"]'),
    };
    /* eslint-enable no-undef */
  };

  const data = await scraper(
    url,
    extractTrackingData,
    {
      waitFor: '[data-testid="tracking-result"], .tracking-container, .shipment-status',
      timeout: 30_000,
    }
  );

  return {
    trackingNumber,
    ...data,
    scrapedAt: new Date().toISOString(),
    source: 'flexport-public-tracking',
  };
}

export async function syncFlexportShipments(db, opts = {}) {
  const pauseMs = Number.isFinite(opts.pauseMs) ? opts.pauseMs : 5_000;

  const snap = await db
    .collection('shipments')
    .where('status', 'in', ['active', 'delayed'])
    .where('flexportTrackingNumber', '!=', null)
    .limit(20)
    .get();

  const updates = [];
  for (const doc of snap.docs) {
    const shipment = doc.data();

    try {
      const tracking = await fetchFlexportTracking(shipment.flexportTrackingNumber, opts);
      await doc.ref.update({
        externalStatus: tracking.status,
        lastTrackedAt: tracking.scrapedAt,
        trackingEvents: tracking.allEvents?.slice(0, 5) || [],
      });

      updates.push({ id: doc.id, status: tracking.status });
    } catch (err) {
      console.warn(`[Flexport] Tracking failed for ${shipment.flexportTrackingNumber}: ${err.message}`);
    }

    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  return updates;
}
