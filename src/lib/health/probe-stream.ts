import "server-only";

const UA = "Zenede-HealthCheck/1.0 (+https://github.com)";
const TIMEOUT_MS = 12_000;

export type ProbeResult = {
  ok: boolean;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
};

/**
 * Lightweight reachability probe (HTTP only — does not demux stream codecs).
 * Uses Range GET first; falls back if server rejects HEAD/Range.
 */
export async function probeStreamUrl(rawUrl: string): Promise<ProbeResult> {
  const url = rawUrl.trim();
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Range: "bytes=0-2048",
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const latencyMs = Date.now() - started;

    if (res.ok || res.status === 206 || res.status === 304) {
      return { ok: true, latencyMs, httpStatus: res.status };
    }

    if (res.status === 405 || res.status === 501) {
      return probeHead(url, started);
    }

    return {
      ok: false,
      latencyMs,
      httpStatus: res.status,
      error: `HTTP ${res.status}`,
    };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs, error: msg.slice(0, 500) };
  }
}

async function probeHead(url: string, started: number): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (res.ok || res.status === 206) {
      return { ok: true, latencyMs, httpStatus: res.status };
    }
    return {
      ok: false,
      latencyMs,
      httpStatus: res.status,
      error: `HEAD ${res.status}`,
    };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs, error: msg.slice(0, 500) };
  }
}
