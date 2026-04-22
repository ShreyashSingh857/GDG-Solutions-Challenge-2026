import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '../../../lib/firebase-admin.js';
import { sendDailyDigest } from '../../../../shared/lib/emailDigest.js';

function toDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function matchesOrg(user, orgId) {
  return String(user?.customClaims?.orgId || '').trim() === orgId;
}

async function listOrgRecipients(orgId) {
  const auth = getAuth();
  const recipients = new Set();
  let pageToken;

  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      if (matchesOrg(user, orgId) && user.email) {
        recipients.add(user.email);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  return Array.from(recipients);
}

async function collectRecentData(sinceDate) {
  const [disruptionSnap, resolutionSnap] = await Promise.all([
    adminDb.collection('disruptions').orderBy('detectedAt', 'desc').limit(250).get(),
    adminDb.collection('resolutions').orderBy('createdAt', 'desc').limit(250).get(),
  ]);

  const disruptions = disruptionSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((record) => toDate(record.detectedAt || record.receivedAt, new Date(0)) >= sinceDate);

  const resolutions = resolutionSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((record) => toDate(record.createdAt, new Date(0)) >= sinceDate);

  return { disruptions, resolutions };
}

async function handleDigest(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const orgId = String(req.headers.get('x-org-id') || process.env.DEFAULT_ORG_ID || 'demo-org').trim();
    const since = toDate(req.headers.get('x-since'), new Date(Date.now() - 24 * 60 * 60 * 1000));

    const requiredToken = process.env.CRON_SECRET || process.env.INTERNAL_TOKEN;
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    if (requiredToken && bearer !== requiredToken && !isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipients = await listOrgRecipients(orgId);
    if (!recipients.length) {
      const fallbackEmail = process.env.DIGEST_EMAIL;
      if (!fallbackEmail) {
        return NextResponse.json({ ok: true, orgId, sent: 0, message: 'No recipients found' });
      }
      recipients.push(fallbackEmail);
    }

    const { disruptions, resolutions } = await collectRecentData(since);

    await Promise.allSettled(
      recipients.map((recipientEmail) => sendDailyDigest({ orgId, recipientEmail, disruptions, resolutions }))
    );

    return NextResponse.json({ ok: true, orgId, sent: recipients.length });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to send digest' }, { status: 500 });
  }
}

export async function GET(req) {
  return handleDigest(req);
}

export async function POST(req) {
  return handleDigest(req);
}