import { watchFile } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { MmdbReader } from "./mmdbReader";
import { env } from "../../env";

/**
 * MaxMind GeoLite2 City reader for analytics locations.
 *
 * Why: the bundled fast-geoip data only covers IPv4 and is frozen at the
 * package version, so IPv6 visitors (most mobile carriers) were stored with no
 * location and IPv4 cities drifted out of date. GeoLite2 City covers IPv4 and
 * IPv6 and MaxMind updates it twice a week.
 *
 * Where the database comes from, first match wins:
 * 1. GEOIP_DB_PATH: an .mmdb file kept current outside the app, for example by
 *    MaxMind's geoipupdate container on a shared volume. The reader reloads
 *    the file when it changes.
 * 2. MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY: the server downloads
 *    GeoLite2 City into GEOIP_CACHE_DIR at startup and refreshes it every
 *    GEOIP_REFRESH_HOURS. A free GeoLite account is enough.
 * 3. Neither: returns null and geo.ts falls back to the bundled IPv4 data.
 *
 * The .mmdb is read by mmdbReader.ts and held in memory (about 60 MB).
 *
 * Only the country code and city name are read. IP addresses are never stored.
 */

const EDITION = "GeoLite2-City";
const DOWNLOAD_URL = `https://download.maxmind.com/geoip/databases/${EDITION}/download?suffix=tar.gz`;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export type GeoIpDatabaseStatus = {
  source: "file" | "download" | "none";
  // Date MaxMind built the loaded database (ISO), or null when none is loaded
  builtAt: string | null;
};

// The parts of a GeoLite2 City record analytics reads
export type CityRecord = {
  country?: { iso_code?: string };
  registered_country?: { iso_code?: string };
  city?: { names?: { en?: string } };
};

export type GeoIpReader = Pick<MmdbReader, "metadata"> & {
  get(ip: string): CityRecord | null;
};

let readerPromise: Promise<GeoIpReader | null> | null = null;
let current: { reader: GeoIpReader; source: "file" | "download" } | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

function cacheFile(): string {
  return path.join(env.GEOIP_CACHE_DIR || path.join(tmpdir(), "amped-geoip"), `${EDITION}.mmdb`);
}

/**
 * Pulls the .mmdb out of MaxMind's tar.gz. Tar is 512 byte headers followed by
 * file data padded to 512 bytes, so no extra dependency is needed.
 */
export function extractMmdbFromTarGz(archive: Buffer): Buffer {
  const tar = gunzipSync(archive);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const sizeField = header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim();
    const size = parseInt(sizeField || "0", 8);
    const dataStart = offset + 512;
    if (name.endsWith(".mmdb")) {
      return Buffer.from(tar.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error("No .mmdb file in the GeoLite2 archive");
}

async function isFresh(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    return Date.now() - info.mtimeMs < env.GEOIP_REFRESH_HOURS * 3_600_000;
  } catch {
    return false;
  }
}

async function download(file: string): Promise<void> {
  const auth = Buffer.from(`${env.MAXMIND_ACCOUNT_ID}:${env.MAXMIND_LICENSE_KEY}`).toString(
    "base64"
  );
  const response = await fetch(DOWNLOAD_URL, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GeoLite2 download failed with HTTP ${response.status}`);
  }
  const mmdb = extractMmdbFromTarGz(Buffer.from(await response.arrayBuffer()));
  await mkdir(path.dirname(file), { recursive: true });
  // Write then rename so a running reader never sees a half written file
  const partial = `${file}.${process.pid}.partial`;
  await writeFile(partial, mmdb);
  await rename(partial, file);
}

async function openFile(file: string): Promise<MmdbReader> {
  return new MmdbReader(await readFile(file));
}

/** Swaps in a newer database without a restart; lookups keep using the old one until then. */
async function reload(file: string, source: "file" | "download") {
  try {
    const reader = await openFile(file);
    current = { reader, source };
    console.info(
      `[ANALYTICS] GeoLite2 City loaded (built ${reader.metadata.buildEpoch.toISOString()})`
    );
  } catch (error) {
    console.warn("[ANALYTICS] Could not reload GeoLite2 City", error);
  }
}

async function openDownloaded(): Promise<MmdbReader | null> {
  const file = cacheFile();
  if (!(await isFresh(file))) {
    try {
      await download(file);
      console.info("[ANALYTICS] GeoLite2 City downloaded");
    } catch (error) {
      // Keep using an older copy if there is one
      console.warn("[ANALYTICS] GeoLite2 City download failed", error);
    }
  }
  try {
    return await openFile(file);
  } catch {
    return null;
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    const file = cacheFile();
    void download(file)
      .then(() => reload(file, "download"))
      .catch(error => console.warn("[ANALYTICS] GeoLite2 City refresh failed", error));
  }, env.GEOIP_REFRESH_HOURS * 3_600_000);
  refreshTimer.unref();
}

// Lookups always go through the current reader, so a reload takes effect at once
const liveReader: GeoIpReader = {
  get metadata() {
    if (!current) throw new Error("No GeoLite2 City database loaded");
    return current.reader.metadata;
  },
  get: ip => current?.reader.get(ip) ?? null,
};

async function load(): Promise<GeoIpReader | null> {
  if (env.GEOIP_DB_PATH) {
    try {
      const reader = await openFile(env.GEOIP_DB_PATH);
      current = { reader, source: "file" };
      // geoipupdate replaces the file in place; poll it hourly and reload
      watchFile(env.GEOIP_DB_PATH, { interval: 3_600_000, persistent: false }, (now, before) => {
        if (now.mtimeMs !== before.mtimeMs) void reload(env.GEOIP_DB_PATH, "file");
      });
      return liveReader;
    } catch (error) {
      console.warn(`[ANALYTICS] Could not open GEOIP_DB_PATH ${env.GEOIP_DB_PATH}`, error);
    }
  }

  if (env.MAXMIND_ACCOUNT_ID && env.MAXMIND_LICENSE_KEY) {
    const reader = await openDownloaded();
    if (reader) {
      current = { reader, source: "download" };
      scheduleRefresh();
      return liveReader;
    }
  }

  console.warn(
    "[ANALYTICS] No GeoLite2 City database. Set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY " +
      "(or GEOIP_DB_PATH). Falling back to bundled IPv4 data: IPv6 visitors will have no location."
  );
  return null;
}

/** The GeoLite2 City reader, or null when none is configured. Loads once. */
export function getGeoIpReader(): Promise<GeoIpReader | null> {
  if (!readerPromise) readerPromise = load();
  return readerPromise;
}

export async function getGeoIpDatabaseStatus(): Promise<GeoIpDatabaseStatus> {
  await getGeoIpReader();
  if (!current) return { source: "none", builtAt: null };
  return {
    source: current.source,
    builtAt: current.reader.metadata.buildEpoch.toISOString(),
  };
}

/** Test hook: use the given reader instead of loading one. */
export function setGeoIpReaderForTests(reader: GeoIpReader | null) {
  current = reader ? { reader, source: "file" } : null;
  readerPromise = Promise.resolve(reader ? liveReader : null);
}
