import { getChainConfig } from "./index";

/**
 * Batch cadence assumed when the chain explorer cannot provide batch data.
 * Matches the historic hard-coded assumption of one batch per minute.
 */
export const FALLBACK_BATCHES_PER_HOUR = 60;

/** Hours of batch history sampled to derive the current sealing rate. */
export const BATCHES_PER_HOUR_WINDOW_HOURS = 24;

/** Successful lookups are reused for this long. */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Failed lookups are retried sooner so a transient explorer outage self-heals. */
const FAILURE_CACHE_TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface BatchCadence {
  /** Measured batch sealing rate, or the fallback rate when the explorer is unavailable. */
  batchesPerHour: number;
  batchesPerYear: number;
  /** "explorer" when the rate was measured, "fallback" when the default was used. */
  source: "explorer" | "fallback";
}

interface ExplorerBatch {
  number: number;
  timestamp: string;
}

interface BatchCadenceCacheEntry {
  cadence: BatchCadence;
  expiresAt: number;
}

const cache = new Map<number, BatchCadenceCacheEntry>();
const inFlight = new Map<number, Promise<BatchCadence>>();

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function getExplorerApiUrl(chainId: number): string | null {
  const chain = getChainConfig(chainId);
  return chain?.blockExplorers?.default?.apiUrl ?? null;
}

/**
 * Returns the newest sealed batch, or the newest one sealed at or before `before`.
 * The explorer lists batches newest-first, so `limit=1` covers both cases.
 */
async function fetchLatestBatch(apiUrl: string, before?: Date): Promise<ExplorerBatch | null> {
  const params = new URLSearchParams({ limit: "1" });
  if (before) {
    params.set("toDate", before.toISOString());
  }

  const data = await fetchJson<{ items?: ExplorerBatch[] }>(`${apiUrl}/batches?${params}`);
  return data.items?.[0] ?? null;
}

/**
 * Measures the average batch sealing rate over the last `windowHours` by comparing the latest
 * batch with the newest batch sealed before the window started. Batches are sealed on demand,
 * so the rate is derived from the actual batch numbers and timestamps rather than assuming a
 * fixed interval.
 *
 * Returns null when the rate cannot be measured (no explorer, chain younger than the window,
 * or no batches sealed during it), letting the caller decide on a fallback.
 */
async function measureBatchesPerHour(chainId: number, windowHours: number): Promise<number | null> {
  const apiUrl = getExplorerApiUrl(chainId);
  if (!apiUrl) return null;

  const latest = await fetchLatestBatch(apiUrl);
  if (!latest) return null;

  const latestTimestamp = new Date(latest.timestamp).getTime();
  if (!Number.isFinite(latestTimestamp)) return null;

  const windowStart = new Date(latestTimestamp - windowHours * 60 * 60 * 1000);
  const previous = await fetchLatestBatch(apiUrl, windowStart);
  if (!previous) return null;

  const previousTimestamp = new Date(previous.timestamp).getTime();
  const elapsedMs = latestTimestamp - previousTimestamp;
  const batchDelta = latest.number - previous.number;

  // A zero delta means no batch was sealed during the window, which is not a usable rate.
  if (!Number.isFinite(previousTimestamp) || elapsedMs <= 0 || batchDelta <= 0) return null;

  const batchesPerHour = batchDelta / (elapsedMs / (60 * 60 * 1000));
  return Number.isFinite(batchesPerHour) && batchesPerHour > 0 ? batchesPerHour : null;
}

function createCadence(batchesPerHour: number, source: BatchCadence["source"]): BatchCadence {
  return { batchesPerHour, batchesPerYear: batchesPerHour * 24 * 365, source };
}

function fallbackCadence(): BatchCadence {
  return createCadence(FALLBACK_BATCHES_PER_HOUR, "fallback");
}

/**
 * Measures the cadence, falling back to the default when the explorer is unavailable.
 * Also returns how long the result may be cached.
 */
async function resolveCadence(chainId: number): Promise<{ cadence: BatchCadence; ttl: number }> {
  try {
    const batchesPerHour = await measureBatchesPerHour(chainId, BATCHES_PER_HOUR_WINDOW_HOURS);
    if (batchesPerHour === null) {
      return { cadence: fallbackCadence(), ttl: FAILURE_CACHE_TTL_MS };
    }
    return { cadence: createCadence(batchesPerHour, "explorer"), ttl: CACHE_TTL_MS };
  } catch (error) {
    console.error(
      `[BATCHES] Failed to read batch cadence from explorer for chain ${chainId}:`,
      error instanceof Error ? error.message : error
    );
    return { cadence: fallbackCadence(), ttl: FAILURE_CACHE_TTL_MS };
  }
}

/**
 * Resolves the batch sealing cadence for a chain, measuring it from the explorer and falling
 * back to the default when it is unavailable. Results are cached per chain.
 */
export async function getBatchCadence(chainId: number): Promise<BatchCadence> {
  const cached = cache.get(chainId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cadence;
  }

  const pending = inFlight.get(chainId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { cadence, ttl } = await resolveCadence(chainId);
      cache.set(chainId, { cadence, expiresAt: Date.now() + ttl });
      return cadence;
    } finally {
      inFlight.delete(chainId);
    }
  })();

  inFlight.set(chainId, request);
  return request;
}
