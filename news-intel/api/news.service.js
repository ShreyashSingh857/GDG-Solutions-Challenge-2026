import { db } from '../../shared/db/firebase.js';
import { runPollCycle } from '../agent/agent.js';

let _lastCycleStats = {
  fetched: 0,
  classified: 0,
  published: 0,
  runAt: null,
  isRunning: false,
  sourcesPolled: 0,
  sourceFailures: 0,
};
let isRunning = false;

function isFirebaseConfigError(err) {
  return String(err?.message || '').includes('Missing FIREBASE_* env vars');
}

export async function triggerManualPoll() {
  if (isRunning) {
    return { skipped: true, reason: 'Cycle in progress', ...getLastCycleStats() };
  }

  isRunning = true;
  setLastCycleStats({ isRunning: true });
  try {
    await runPollCycle();
    return { skipped: false, ...getLastCycleStats() };
  } finally {
    isRunning = false;
    setLastCycleStats({ isRunning: false });
  }
}

export function setLastCycleStats(stats) {
  _lastCycleStats = { ..._lastCycleStats, ...stats };
}

export function getLastCycleStats() {
  return { ..._lastCycleStats, isRunning };
}

export async function getRecentAlerts(limit = 20) {
  try {
    const snapshot = await db.collection('news_alerts').orderBy('detectedAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      return [];
    }
    throw err;
  }
}