import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const SERVICES = [
  { name: 'event-bus', baseUrl: 'http://localhost:4000' },
  { name: 'disruption', baseUrl: 'http://localhost:3001' },
  { name: 'impact', baseUrl: 'http://localhost:3002' },
  { name: 'resolution', baseUrl: 'http://localhost:3003' },
  { name: 'news-intel', baseUrl: 'http://localhost:3005' },
];

function getTimestampParts() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return { nowIso: now.toISOString(), ts };
}

function createLogger() {
  const chunks = [];
  return {
    write(line = '') {
      chunks.push(line);
      console.log(line);
    },
    toString() {
      return `${chunks.join('\n')}\n`;
    },
  };
}

async function requestJson(url, options) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      data,
      text,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - started,
      error: err?.message || String(err),
      data: null,
      text: '',
    };
  }
}

async function runCommand(command, args, logger) {
  logger.write(`$ ${command} ${args.join(' ')}`);
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim().length) logger.write(`  ${line}`);
      });
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim().length) logger.write(`  [stderr] ${line}`);
      });
    });

    child.on('close', (code) => {
      logger.write(`  -> exit ${code}`);
      resolve({ command: `${command} ${args.join(' ')}`, code: code ?? 1, stdout, stderr });
    });
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageCounts(payload) {
  return payload?.messageCounts || {};
}

function computeDelta(before = {}, after = {}) {
  const keys = ['disruption-events', 'impact-reports', 'resolution-options', 'news-alerts'];
  const delta = {};
  for (const key of keys) {
    const b = Number(before[key] ?? 0);
    const a = Number(after[key] ?? 0);
    delta[key] = a - b;
  }
  return delta;
}

async function main() {
  const { nowIso, ts } = getTimestampParts();
  const logger = createLogger();

  const outputDir = 'docs/smoketest';
  const logPath = `${outputDir}/smoke-${ts}.log`;
  const jsonPath = `${outputDir}/smoke-${ts}.json`;
  const traceId = `smoke-${ts}`;

  await mkdir(outputDir, { recursive: true });

  logger.write(`Smoke started at ${nowIso}`);
  logger.write(`Trace ID: ${traceId}`);

  const serviceChecks = [];
  for (const svc of SERVICES) {
    const health = await requestJson(`${svc.baseUrl}/health`);
    const metrics = await requestJson(`${svc.baseUrl}/metrics`);
    serviceChecks.push({ service: svc.name, health, metrics });
    logger.write(`[${svc.name}] /health -> ${health.status} (${health.elapsedMs}ms)`);
    logger.write(`[${svc.name}] /metrics -> ${metrics.status} (${metrics.elapsedMs}ms)`);
  }

  const eventBusHealth = serviceChecks.find((s) => s.service === 'event-bus')?.health?.data;
  const baselineMessageCounts = getMessageCounts(eventBusHealth);
  logger.write(`Baseline counts: ${JSON.stringify(baselineMessageCounts)}`);

  const postDisruption = await requestJson('http://localhost:3001/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Smoke automation disruption event',
      traceId,
    }),
  });
  logger.write(`POST /events -> ${postDisruption.status} (${postDisruption.elapsedMs}ms)`);

  let postCounts = baselineMessageCounts;
  let pollAttempts = 0;
  let chainComplete = false;
  const startedPoll = Date.now();
  while (Date.now() - startedPoll < 120000) {
    pollAttempts += 1;
    const bus = await requestJson('http://localhost:4000/health');
    postCounts = getMessageCounts(bus.data);

    const disruptionDelta = Number(postCounts['disruption-events'] ?? 0) - Number(baselineMessageCounts['disruption-events'] ?? 0);
    const impactDelta = Number(postCounts['impact-reports'] ?? 0) - Number(baselineMessageCounts['impact-reports'] ?? 0);
    const resolutionDelta = Number(postCounts['resolution-options'] ?? 0) - Number(baselineMessageCounts['resolution-options'] ?? 0);

    if (disruptionDelta >= 1 && impactDelta >= 1 && resolutionDelta >= 1) {
      chainComplete = true;
      break;
    }

    await sleep(4000);
  }

  const messageCountDelta = computeDelta(baselineMessageCounts, postCounts);
  logger.write(`Post counts: ${JSON.stringify(postCounts)}`);
  logger.write(`Count delta: ${JSON.stringify(messageCountDelta)}`);

  const resolutionProbe = await requestJson(`http://localhost:3003/options/${traceId}`);
  const resolutionOptionCount = Array.isArray(resolutionProbe.data?.data) ? resolutionProbe.data.data.length : 0;
  const resolutionFirstTitle = resolutionProbe.data?.data?.[0]?.title || null;
  logger.write(`GET /options/${traceId} -> ${resolutionProbe.status} (${resolutionProbe.elapsedMs}ms)`);

  logger.write('Running scraper smoke checks');
  const scraperSmoke = await runCommand('npm', ['run', 'smoke:scraper'], logger);
  const scraperToolingSmoke = await runCommand('node', ['--test', 'disruption/tests/*.smoke.test.js'], logger);

  const summary = {
    timestamp: nowIso,
    traceId,
    files: {
      logPath,
      jsonPath,
    },
    serviceChecks: serviceChecks.map((svc) => ({
      service: svc.service,
      health: { ok: svc.health.ok, status: svc.health.status, elapsedMs: svc.health.elapsedMs, error: svc.health.error || null },
      metrics: { ok: svc.metrics.ok, status: svc.metrics.status, elapsedMs: svc.metrics.elapsedMs, error: svc.metrics.error || null },
    })),
    baselineMessageCounts,
    postDisruption: {
      ok: postDisruption.ok,
      status: postDisruption.status,
      elapsedMs: postDisruption.elapsedMs,
      error: postDisruption.error || null,
    },
    pollAttempts,
    chainComplete,
    postMessageCounts: postCounts,
    messageCountDelta,
    resolutionProbe: {
      ok: resolutionProbe.ok,
      status: resolutionProbe.status,
      elapsedMs: resolutionProbe.elapsedMs,
      optionCount: resolutionOptionCount,
      firstTitle: resolutionFirstTitle,
      error: resolutionProbe.error || null,
    },
    scraperChecks: {
      smokeScraper: { passed: scraperSmoke.code === 0, exitCode: scraperSmoke.code },
      disruptionSmokes: { passed: scraperToolingSmoke.code === 0, exitCode: scraperToolingSmoke.code },
    },
  };

  summary.overallPass =
    summary.serviceChecks.every((s) => s.health.ok && s.metrics.ok)
    && summary.postDisruption.ok
    && summary.chainComplete
    && summary.resolutionProbe.ok
    && summary.resolutionProbe.optionCount > 0
    && summary.scraperChecks.smokeScraper.passed
    && summary.scraperChecks.disruptionSmokes.passed;

  await writeFile(logPath, logger.toString(), 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Smoke log written: ${logPath}`);
  console.log(`Smoke summary written: ${jsonPath}`);
  console.log(`OVERALL_PASS=${summary.overallPass}`);

  if (!summary.overallPass) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error('[smoke-overall] fatal:', err?.stack || err?.message || err);
  process.exit(1);
});