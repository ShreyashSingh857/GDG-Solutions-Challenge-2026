import { db } from '../../shared/db/firebase.js';
import { runPollCycle } from '../agent/agent.js';

let lastCycleStats = { fetched: 0, classified: 0, published: 0, runAt: null };
let isRunning = false;

export async function triggerManualPoll() {
  if (isRunning) {
    return { skipped: true, reason: 'Cycle in progress', ...lastCycleStats };
  }

  isRunning = true;
  try {
    const stats = await runPollCycle();
    lastCycleStats = { ...stats, runAt: new Date().toISOString() };
    return { skipped: false, ...lastCycleStats };
  } finally {
    isRunning = false;
  }
}

export function getLastCycleStats() {
  return { ...lastCycleStats, isRunning };
}

export async function getRecentAlerts(limit = 20) {
  const snapshot = await db.collection('news_alerts').orderBy('detectedAt', 'desc').limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}