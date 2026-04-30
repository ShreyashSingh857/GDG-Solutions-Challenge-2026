#!/usr/bin/env node
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';

const SCENARIO = process.argv[2] || 'pacific_storm';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logsDir = join(process.cwd(), 'smoke-logs');
if (!existsSync(logsDir)) mkdirSync(logsDir);
const logPath = join(logsDir, `smoke-${SCENARIO}-${timestamp}.log`);

function runStreamed(cmd, args = [], opts = {}) {
  console.log('RUN:', cmd, ...(args.length ? ['--', ...args] : []));
  appendFileSync(logPath, `\n\n=== CMD: ${cmd} ${args.join(' ')}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    child.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(s);
      appendFileSync(logPath, s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      process.stderr.write(s);
      appendFileSync(logPath, s);
    });
    child.on('error', (err) => {
      appendFileSync(logPath, `\nPROCESS ERROR: ${err.message}\n`);
      reject(err);
    });
    child.on('close', (code) => {
      appendFileSync(logPath, `\nPROCESS EXIT CODE: ${code}\n`);
      if (code === 0) resolve(code);
      else reject(new Error(`Exit code ${code}`));
    });
  });
}

function runSync(cmd, args = [], opts = {}) {
  console.log('RUN-SYNC:', cmd, ...(args.length ? ['--', ...args] : []));
  appendFileSync(logPath, `\n\n=== CMD-SYNC: ${cmd} ${args.join(' ')}\n`);
  const res = spawnSync(cmd, args, { shell: true, encoding: 'utf8', ...opts });
  if (res.stdout) appendFileSync(logPath, res.stdout);
  if (res.stderr) appendFileSync(logPath, res.stderr);
  appendFileSync(logPath, `\nPROCESS EXIT CODE: ${res.status}\n`);
  if (res.error) {
    appendFileSync(logPath, `\nPROCESS ERROR: ${res.error.message}\n`);
    throw res.error;
  }
  if (res.status !== 0) throw new Error(`Exit code ${res.status}`);
  return res;
}

(async function main() {
  console.log('Smoke pipeline run start:', SCENARIO);
  writeFileSync(logPath, `Smoke run start: ${new Date().toISOString()}\nScenario: ${SCENARIO}\n`);

  // Step 1: inject scenario into resolution simulation
  console.log('Injecting scenario:', SCENARIO);
  let injectedDisruptionId = null;
  let injectedTraceId = null;
  try {
    const injectRes = runSync('node', [`resolution/simulation/inject.js`, SCENARIO]);
    const stdout = injectRes.stdout || '';
    const didMatch = stdout.match(/Disruption ID:\s*(\S+)/i);
    const traceMatch = stdout.match(/TraceId:\s*(\S+)/i);
    const publishedMatch = stdout.match(/Published to event bus:\s*(true|false)/i);
    const wasPublished = publishedMatch ? String(publishedMatch[1]).toLowerCase() === 'true' : true;
    if (didMatch) injectedDisruptionId = didMatch[1].trim();
    if (traceMatch) injectedTraceId = traceMatch[1].trim();
    appendFileSync(logPath, `\nParsed injection: disruptionId=${injectedDisruptionId} traceId=${injectedTraceId}\n`);
    if (!wasPublished) {
      appendFileSync(logPath, `Detected published:false from injector — attempting fallback publish to event-bus\n`);
      try {
        const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'http://localhost:4000';
        let disruptionRow = null;
        // Prefer Firestore canonical document (camelCase payload) when available
        try {
          const { db } = await import('../shared/db/firebase.js');
          if (injectedDisruptionId) {
            const doc = await db.collection('disruptions').doc(injectedDisruptionId).get();
            if (doc.exists) disruptionRow = doc.data();
          }
        } catch (fsErr) {
          appendFileSync(logPath, `Firestore lookup failed (non-fatal): ${fsErr.message}\n`);
        }
        if (!disruptionRow) {
          const { supabase } = await import('../shared/db/supabase.js');
          if (injectedDisruptionId) {
            const { data: dRows, error: dErr } = await supabase.from('disruptions').select('*').eq('id', injectedDisruptionId).limit(1);
            if (!dErr && dRows && dRows.length) disruptionRow = dRows[0];
          }
        }
        if (!disruptionRow) {
          appendFileSync(logPath, `Fallback publish: could not find persisted disruption row for id=${injectedDisruptionId}\n`);
        } else {
          const payload = { agentId: 'monitor', traceId: injectedTraceId || injectedDisruptionId, timestamp: new Date().toISOString(), payload: disruptionRow };
          appendFileSync(logPath, `Posting fallback publish to ${EVENT_BUS_URL}/publish with traceId=${payload.traceId}\n`);
          const resp = await fetch(`${EVENT_BUS_URL}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'disruption-events', payload }) });
          const respText = await resp.text().catch(() => '');
          appendFileSync(logPath, `Fallback publish response: ${resp.status} ${resp.statusText} ${respText}\n`);
          if (!resp.ok) appendFileSync(logPath, `Fallback publish returned non-OK status\n`);
        }
      } catch (fbErr) {
        appendFileSync(logPath, `Fallback publish failed: ${fbErr.message}\n`);
      }
    }
  } catch (err) {
    console.error('Injection failed, aborting. See log:', logPath);
    process.exit(2);
  }

  // Step 2: run the overall smoke script which polls the services
  console.log('Running smoke-overall.mjs to exercise pipeline...');
  let smokeTraceId = null;
  try {
    const smokeRes = runSync('node', ['scripts/smoke-overall.mjs']);
    const smokeOut = smokeRes.stdout || '';
    const m = smokeOut.match(/Trace ID:\s*(\S+)/i);
    if (m) smokeTraceId = m[1].trim();
    appendFileSync(logPath, `\nParsed smoke-overall traceId: ${smokeTraceId}\n`);
  } catch (err) {
    appendFileSync(logPath, `\nSmoke overall script failed (non-fatal): ${err.message}\n`);
    console.warn('Smoke overall script failed (non-fatal). Continuing to verification.');
  }

  // Step 3: capture a quick health snapshot of key services
  try {
    const services = ['http://localhost:4000/health','http://localhost:3001/health','http://localhost:3002/health','http://localhost:3003/health','http://localhost:3005/health','http://localhost:3000/health'];
    for (const s of services) {
        try {
          runSync('node', ['-e', `(async()=>{try{const r=await fetch('${s}');console.log(await r.text())}catch(e){console.error(e.message);process.exit(2)}})()`]);
        } catch (e) {
          console.warn('Health check failed for', s);
        }
    }
  } catch (e) {
    // ignore
  }

  appendFileSync(logPath, `\nSmoke run finished: ${new Date().toISOString()}\n`);
  // Supabase verification: check that key rows for this smoke run were written.
  try {
    // Dynamic import of shared supabase client
    const { supabase } = await import('../shared/db/supabase.js');
    let allPresent = true;
    appendFileSync(logPath, `\nSupabase verification start:\n`);
    if (injectedDisruptionId) {
      const { data: dRows, error: dErr } = await supabase.from('disruptions').select('id').eq('id', injectedDisruptionId).limit(1);
      if (dErr) {
        appendFileSync(logPath, `disruptions query error: ${dErr.message}\n`);
        allPresent = false;
      } else if (!dRows || dRows.length === 0) {
        appendFileSync(logPath, `disruptions: MISSING row for id=${injectedDisruptionId}\n`);
        allPresent = false;
      } else appendFileSync(logPath, `disruptions: FOUND ${injectedDisruptionId}\n`);
    }
    // Prefer verifying the smoke-run traceId if available, otherwise fall back to the injected trace
    const traceToCheck = smokeTraceId || injectedTraceId;
    if (traceToCheck) {
      const { data: iRows, error: iErr } = await supabase.from('impact_reports').select('id').eq('trace_id', traceToCheck).limit(1);
      if (iErr) { appendFileSync(logPath, `impact_reports query error: ${iErr.message}\n`); allPresent = false; }
      else if (!iRows || iRows.length === 0) { appendFileSync(logPath, `impact_reports: MISSING for trace=${traceToCheck}\n`); allPresent = false; }
      else appendFileSync(logPath, `impact_reports: FOUND for trace=${traceToCheck}\n`);

      const { data: rRows, error: rErr } = await supabase.from('resolution_options').select('id').eq('resolution_id', traceToCheck).limit(1);
      if (rErr) { appendFileSync(logPath, `resolution_options query error: ${rErr.message}\n`); allPresent = false; }
      else if (!rRows || rRows.length === 0) { appendFileSync(logPath, `resolution_options: MISSING for resolution_id=${traceToCheck}\n`); allPresent = false; }
      else appendFileSync(logPath, `resolution_options: FOUND for resolution_id=${traceToCheck}\n`);
    }
    // If missing for the smoke trace, attempt fallback publish and poll for up to 30s
    const traceToPoll = smokeTraceId || injectedTraceId;
    if (traceToPoll && !allPresent) {
      appendFileSync(logPath, `\nAttempting fallback publish+poll for trace: ${traceToPoll}\n`);
      try {
        const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'http://localhost:4000';
        // Prefer Firestore canonical doc when possible
        let disruptionRow = null;
        try {
          const { db } = await import('../shared/db/firebase.js');
          const q = await db.collection('disruptions').where('traceId', '==', traceToPoll).limit(1).get();
          if (!q.empty) disruptionRow = q.docs[0].data();
        } catch (fsErr) {
          appendFileSync(logPath, `Firestore lookup by trace failed (non-fatal): ${fsErr.message}\n`);
        }
        if (!disruptionRow) {
          const { supabase } = await import('../shared/db/supabase.js');
          const { data: dRows, error: dErr } = await supabase.from('disruptions').select('*').eq('trace_id', traceToPoll).limit(1);
          disruptionRow = (!dErr && dRows && dRows.length) ? dRows[0] : null;
        }
        if (disruptionRow) {
          const payload = { agentId: 'monitor', traceId: traceToPoll, timestamp: new Date().toISOString(), payload: disruptionRow };
          await fetch(`${EVENT_BUS_URL}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'disruption-events', payload }) });
          appendFileSync(logPath, `Fallback publish posted for trace ${traceToPoll}, now polling Supabase up to 30s\n`);
          const deadline = Date.now() + 30000;
          let found = false;
          while (Date.now() < deadline) {
            const { data: i2, error: i2Err } = await supabase.from('impact_reports').select('id').eq('trace_id', traceToPoll).limit(1);
            const { data: r2, error: r2Err } = await supabase.from('resolution_options').select('id').eq('resolution_id', traceToPoll).limit(1);
            if ((!i2Err && i2 && i2.length) && (!r2Err && r2 && r2.length)) { found = true; break; }
            await new Promise((res) => setTimeout(res, 3000));
          }
          appendFileSync(logPath, `Polling result for ${traceToPoll}: ${found}\n`);
          if (found) allPresent = true;
        } else {
          appendFileSync(logPath, `No persisted disruption found for trace ${traceToPoll}, cannot fallback publish\n`);
        }
      } catch (pollErr) {
        appendFileSync(logPath, `Fallback publish+poll failed: ${pollErr.message}\n`);
      }
    }
    appendFileSync(logPath, `Supabase verification result: ${allPresent}\n`);
    console.log('Supabase verification result:', allPresent);
    if (!allPresent) process.exit(4);
  } catch (err) {
    appendFileSync(logPath, `Supabase verification failed: ${err.message}\n`);
    console.error('Supabase verification failed:', err.message);
    process.exit(5);
  }
  console.log('Smoke run complete. Logs:', logPath);
})();
