const enabled = !["0", "false", "no"].includes(
  String(process.env.ZENDE_IMDB_NIGHTLY_ENABLED ?? "1").trim().toLowerCase(),
);
const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
const port = Number.parseInt(process.env.PORT ?? "8077", 10) || 8077;
const hour = Math.max(0, Math.min(23, Number.parseInt(process.env.ZENDE_IMDB_NIGHTLY_HOUR ?? "3", 10) || 3));
const minute = Math.max(0, Math.min(59, Number.parseInt(process.env.ZENDE_IMDB_NIGHTLY_MINUTE ?? "15", 10) || 15));

function nextRun(now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

async function run() {
  const started = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/cron/imdb-ratings`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(6 * 60 * 60 * 1_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    console.log(`[imdb-scheduler] refresh completed in ${Date.now() - started}ms: ${body}`);
  } catch (error) {
    console.error(`[imdb-scheduler] refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    schedule();
  }
}

function schedule() {
  const next = nextRun();
  const delay = Math.max(1_000, next.getTime() - Date.now());
  console.log(`[imdb-scheduler] next refresh ${next.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  setTimeout(() => void run(), delay);
}

if (!enabled) {
  console.log("[imdb-scheduler] disabled by ZENDE_IMDB_NIGHTLY_ENABLED");
  process.exit(0);
}
if (!cronSecret) {
  console.error("[imdb-scheduler] CRON_SECRET is required; nightly IMDb refresh is disabled");
  process.exit(1);
}

schedule();
