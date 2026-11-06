/**
 * Offline downloads on this device (Build Board #26, FL-5, spec 3.5 Offline,
 * decision C, board m10).
 *
 * - The files live in Cache Storage under /downloads/{publicId}; the service
 *   worker (public/sw.js) answers those paths, with byte ranges for the player.
 * - The list lives in local storage, one per account: amped.downloads.<account>.
 *   It holds what the Downloads screen shows offline (title, owner, size) and
 *   the time of the last access check.
 * - Offline opens are allowed for 30 days after the last successful check.
 * - A copy the check says the fan may no longer keep is deleted at once.
 * - Signing out, or another account signing in, deletes the copies.
 */
import { useSyncExternalStore } from "react";
import {
  LIBRARY_DOWNLOADS,
  canKeepOffline,
  type LibraryDownloadGrant,
  type LibraryDownloadRemovedReason,
  type LibraryDownloadsCheck,
  type LibraryItem,
  type LibraryOwner,
} from "@repo/constants";
import type { PlayerSource } from "@repo/ui";

export const DOWNLOADS_CACHE = "amped-downloads-v1";
const INDEX_PREFIX = "amped.downloads.";
const DEVICE_KEY = "amped.device";
const WIFI_KEY = "amped.downloads.wifiOnly";

/** A copy kept on this device, as the Downloads screen shows it offline. */
export interface StoredDownload {
  /** The server's DownloadRecord id */
  id: string;
  publicId: string;
  kind: LibraryItem["kind"];
  title: string;
  owner: LibraryOwner;
  cover: string | null;
  durationMs: number | null;
  pageCount: number | null;
  bytes: number;
  mimeType: string;
  fileName: string;
  savedAt: string;
}

export interface DownloadIndex {
  account: number;
  /** ISO time of the last successful check, or null before the first */
  lastCheckAt: string | null;
  items: StoredDownload[];
  /** Copies the last check deleted, for the notice on Downloads */
  removed: { title: string; reason: LibraryDownloadRemovedReason }[];
  /** Records removed while offline, told to the server at the next check */
  pending?: string[];
}

/** Server calls the store needs. The app passes trpcClient; tests pass fakes. */
export interface DownloadsApi {
  recordDownload(input: { publicId: string; device: string }): Promise<LibraryDownloadGrant>;
  markDownloaded(input: { id: string; bytes: number }): Promise<unknown>;
  removeDownload(input: { id: string }): Promise<unknown>;
  downloadsCheck(input: { device: string; ids: string[] }): Promise<LibraryDownloadsCheck>;
}

// ---------------------------------------------------------------- storage helpers

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the list stays as it was in memory
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** A random id for this installed app (spec 3.3: never a fingerprint). */
export function deviceId(): string {
  const stored = read<string>(DEVICE_KEY);
  if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
  const id = `dev_${randomId()}`;
  write(DEVICE_KEY, id);
  return id;
}

export function fileKey(publicId: string) {
  return `/downloads/${publicId}`;
}

// ---------------------------------------------------------------- the store

let active: number | null = null;

/** The signed in account whose copies play (DownloadsSync sets it). */
export function setActiveAccount(account: number | null) {
  active = account;
  emit();
}

export function activeAccount(): number | null {
  return active;
}

const listeners = new Set<() => void>();
const indexes = new Map<number, DownloadIndex>();
/** Bytes received for downloads in progress, by publicId */
const progress = new Map<string, { received: number; total: number | null }>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emptyIndex(account: number): DownloadIndex {
  return { account, lastCheckAt: null, items: [], removed: [] };
}

export function readIndex(account: number): DownloadIndex {
  const cached = indexes.get(account);
  if (cached) return cached;
  const stored = read<DownloadIndex>(`${INDEX_PREFIX}${account}`);
  const index =
    stored && stored.account === account && Array.isArray(stored.items)
      ? { ...emptyIndex(account), ...stored }
      : emptyIndex(account);
  indexes.set(account, index);
  return index;
}

function saveIndex(index: DownloadIndex) {
  indexes.set(index.account, index);
  write(`${INDEX_PREFIX}${index.account}`, index);
  emit();
}

/** The accounts with a list on this device. */
function storedAccounts(): number[] {
  const out: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key && /^amped\.downloads\.(\d+)$/.exec(key);
      if (match) out.push(Number(match[1]));
    }
  } catch {
    // Storage blocked: nothing listed
  }
  return out;
}

/** The account whose copies are on this device, for the offline screen. */
export function deviceAccount(): number | null {
  const [first] = storedAccounts();
  return first ?? null;
}

export function wifiOnly(): boolean {
  return read<boolean>(WIFI_KEY) ?? true;
}

export function setWifiOnly(on: boolean) {
  write(WIFI_KEY, on);
  emit();
}

/** Re-renders when the list, the progress or the Wi-Fi setting changes. */
export function useDownloadsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
}

export function downloadProgress(publicId: string) {
  return progress.get(publicId) ?? null;
}

export function findDownload(account: number, publicId: string): StoredDownload | null {
  return readIndex(account).items.find(item => item.publicId === publicId) ?? null;
}

/** True while offline opens are allowed: within 30 days of the last successful check. */
export function offlineWindowOpen(index: DownloadIndex, now: number = Date.now()): boolean {
  if (!index.lastCheckAt) return false;
  const at = Date.parse(index.lastCheckAt);
  return Number.isFinite(at) && now - at < LIBRARY_DOWNLOADS.offlineWindowMs;
}

// ---------------------------------------------------------------- network

type ConnectionInfo = { type?: string; saveData?: boolean };

/**
 * False when Download on Wi-Fi only is on and the browser says this is a
 * cellular connection. Browsers that do not say (iOS Safari, Firefox) are not
 * blocked: the Downloads screen tells the fan so.
 */
export function networkAllowsDownload(): boolean {
  if (!wifiOnly()) return true;
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  const type = connection?.type;
  if (!type || type === "unknown") return true;
  return type === "wifi" || type === "ethernet";
}

/** True when the browser can tell Wi-Fi from cellular. */
export function knowsConnectionType(): boolean {
  const type = (navigator as Navigator & { connection?: ConnectionInfo }).connection?.type;
  return !!type && type !== "unknown";
}

// ---------------------------------------------------------------- files

export class DownloadFailed extends Error {
  constructor(
    readonly reason: "wifi" | "storage" | "network" | "unsupported" | "refused" | "busy",
    message?: string
  ) {
    super(message ?? reason);
  }
}

function cacheAvailable(): boolean {
  return typeof caches !== "undefined";
}

const MIME_BY_KIND: Record<string, string> = {
  video: "video/mp4",
  audio: "audio/mpeg",
  document: "application/pdf",
  file: "application/octet-stream",
};

/** Copies the response into the cache while counting bytes, without holding the file in memory. */
async function storeFile(
  publicId: string,
  response: Response,
  mimeType: string,
  onBytes: (received: number) => void
): Promise<number> {
  let received = 0;
  const counted = response.body
    ? response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            onBytes(received);
            controller.enqueue(chunk);
          },
        })
      )
    : null;
  const stored = new Response(counted ?? (await response.blob()), {
    headers: { "Content-Type": mimeType },
  });
  const cache = await caches.open(DOWNLOADS_CACHE);
  await cache.put(fileKey(publicId), stored);
  if (!counted) {
    const check = await cache.match(fileKey(publicId));
    received = check ? (await check.blob()).size : 0;
  }
  return received;
}

async function deleteFile(publicId: string) {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(DOWNLOADS_CACHE);
    await cache.delete(fileKey(publicId));
  } catch {
    // The cache went with the site's data already
  }
}

/** The type the file plays as: the response's, unless it is a generic one. */
function mimeFor(item: LibraryItem, response: Response): string {
  const type = (response.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  if (type && type !== "application/octet-stream" && type !== "binary/octet-stream") return type;
  return MIME_BY_KIND[item.kind] ?? "application/octet-stream";
}

/**
 * Downloads one item to this device. Asks the server for a single use link,
 * fetches it into the cache, then records the size. A failure leaves nothing
 * behind on the device or the server.
 */
export async function startDownload(
  api: DownloadsApi,
  account: number,
  item: LibraryItem
): Promise<StoredDownload> {
  if (!cacheAvailable()) throw new DownloadFailed("unsupported");
  if (!canKeepOffline(item)) throw new DownloadFailed("refused");
  if (!networkAllowsDownload()) throw new DownloadFailed("wifi");
  const existing = findDownload(account, item.publicId);
  if (existing) return existing;
  if (progress.has(item.publicId)) throw new DownloadFailed("busy");

  progress.set(item.publicId, { received: 0, total: null });
  emit();
  // Ask the browser to keep the copies under storage pressure (spec 3.13: iOS
  // eviction). Installed apps are usually granted; a refusal changes nothing.
  void navigator.storage?.persist?.().catch(() => false);
  let grant: LibraryDownloadGrant | null = null;
  try {
    grant = await api.recordDownload({ publicId: item.publicId, device: deviceId() });
    let response: Response;
    try {
      response = await fetch(grant.url, { mode: "cors", credentials: "omit", cache: "no-store" });
    } catch {
      throw new DownloadFailed("network");
    }
    if (!response.ok) throw new DownloadFailed("network");
    const total = Number(response.headers.get("Content-Length")) || null;
    progress.set(item.publicId, { received: 0, total });
    emit();
    const mimeType = mimeFor(item, response);
    let bytes: number;
    try {
      bytes = await storeFile(item.publicId, response, mimeType, received => {
        progress.set(item.publicId, { received, total });
        emit();
      });
    } catch (error) {
      await deleteFile(item.publicId);
      const quota = error instanceof DOMException && error.name === "QuotaExceededError";
      throw new DownloadFailed(quota ? "storage" : "network");
    }
    await api.markDownloaded({ id: grant.id, bytes }).catch(() => {});
    const stored: StoredDownload = {
      id: grant.id,
      publicId: item.publicId,
      kind: item.kind,
      title: item.title,
      owner: item.owner,
      cover: item.cover?.src ?? null,
      durationMs: item.durationMs,
      pageCount: item.pageCount,
      bytes,
      mimeType,
      fileName: grant.fileName,
      savedAt: new Date().toISOString(),
    };
    const index = readIndex(account);
    saveIndex({
      ...index,
      // A first download counts as a check: the fan had access a moment ago
      lastCheckAt: index.lastCheckAt ?? stored.savedAt,
      items: [stored, ...index.items.filter(entry => entry.publicId !== item.publicId)],
    });
    return stored;
  } catch (error) {
    if (grant) await api.removeDownload({ id: grant.id }).catch(() => {});
    throw error instanceof DownloadFailed ? error : new DownloadFailed("refused", messageOf(error));
  } finally {
    progress.delete(item.publicId);
    emit();
  }
}

function messageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

/** Removes one copy (swipe, Remove). The server forgets it when it can be reached. */
export async function removeStored(
  api: Pick<DownloadsApi, "removeDownload"> | null,
  account: number,
  publicId: string
): Promise<void> {
  const index = readIndex(account);
  const entry = index.items.find(item => item.publicId === publicId);
  await deleteFile(publicId);
  const told =
    entry && api
      ? await api.removeDownload({ id: entry.id }).then(
          () => true,
          () => false
        )
      : false;
  saveIndex({
    ...index,
    items: index.items.filter(item => item.publicId !== publicId),
    pending: entry && !told ? [...(index.pending ?? []), entry.id] : index.pending,
  });
}

/** Clear all (behind a confirm). */
export async function clearAll(
  api: Pick<DownloadsApi, "removeDownload"> | null,
  account: number
): Promise<void> {
  const index = readIndex(account);
  for (const entry of index.items) await deleteFile(entry.publicId);
  const untold: string[] = [];
  await Promise.all(
    index.items.map(async entry => {
      const told = api
        ? await api.removeDownload({ id: entry.id }).then(
            () => true,
            () => false
          )
        : false;
      if (!told) untold.push(entry.id);
    })
  );
  saveIndex({ ...index, items: [], removed: [], pending: [...(index.pending ?? []), ...untold] });
}

/** Tells the server about copies removed while offline. */
export async function flushPending(api: Pick<DownloadsApi, "removeDownload">, account: number) {
  const index = readIndex(account);
  if (!index.pending?.length) return;
  const left: string[] = [];
  for (const id of index.pending) {
    const told = await api.removeDownload({ id }).then(
      () => true,
      () => false
    );
    if (!told) left.push(id);
  }
  saveIndex({ ...readIndex(account), pending: left });
}

/** Sign out, or another account on this device: every copy and list goes. */
export async function clearDevice(except?: number): Promise<void> {
  for (const account of storedAccounts()) {
    if (account === except) continue;
    const index = readIndex(account);
    for (const entry of index.items) await deleteFile(entry.publicId);
    indexes.delete(account);
    write(`${INDEX_PREFIX}${account}`, null);
  }
  emit();
}

/** Hides the "removed at the last check" notice. */
export function dismissRemoved(account: number) {
  const index = readIndex(account);
  if (index.removed.length) saveIndex({ ...index, removed: [] });
}

/**
 * The access check (spec 3.5): on app open and every 6 hours while open.
 * Deletes the files the fan may no longer keep and moves the offline window.
 */
export async function checkDownloads(
  api: Pick<DownloadsApi, "downloadsCheck">,
  account: number
): Promise<LibraryDownloadsCheck | null> {
  const index = readIndex(account);
  if (!index.items.length) return null;
  // The schema takes at most checkMax ids: check in chunks, so a fan with more
  // copies than that still has every one of them revalidated before the window
  // moves
  const ids = index.items.map(item => item.id);
  const checked: LibraryDownloadsCheck["removed"] = [];
  let checkedAt = "";
  for (let at = 0; at < ids.length; at += LIBRARY_DOWNLOADS.checkMax) {
    const result = await api.downloadsCheck({
      device: deviceId(),
      ids: ids.slice(at, at + LIBRARY_DOWNLOADS.checkMax),
    });
    checked.push(...result.removed);
    checkedAt = result.checkedAt;
  }
  const removedIds = new Map(checked.map(entry => [entry.id, entry.reason]));
  const gone = index.items.filter(item => removedIds.has(item.id));
  for (const entry of gone) await deleteFile(entry.publicId);
  const fresh = readIndex(account);
  saveIndex({
    ...fresh,
    lastCheckAt: checkedAt,
    items: fresh.items.filter(item => !removedIds.has(item.id)),
    // The fan removed those themselves; only the others need telling
    removed: [
      ...fresh.removed,
      ...gone
        .map(entry => ({ title: entry.title, reason: removedIds.get(entry.id)! }))
        .filter(entry => entry.reason !== "removed"),
    ],
  });
  return {
    allowed: readIndex(account).items.map(item => item.id),
    removed: checked,
    checkedAt,
  };
}

/** The player source for a copy that may open now, or null to stream. */
export function localSource(account: number | null, publicId: string): PlayerSource | null {
  if (account === null) return null;
  const index = readIndex(account);
  const entry = index.items.find(item => item.publicId === publicId);
  if (!entry || !offlineWindowOpen(index)) return null;
  // The player refreshes a source a minute before it expires, with a timer.
  // Timers overflow past 24.8 days and fire at once, so a local source lasts
  // 6 hours (one check interval), never past the offline window.
  const windowEnds = Date.parse(index.lastCheckAt!) + LIBRARY_DOWNLOADS.offlineWindowMs;
  const expiresAt = Math.min(windowEnds, Date.now() + LIBRARY_DOWNLOADS.checkEveryMs);
  if (entry.kind === "video") {
    return { kind: "video", hls: "", mp4: fileKey(publicId), poster: entry.cover, expiresAt };
  }
  if (entry.kind === "audio") {
    return { kind: "audio", src: fileKey(publicId), mimeType: entry.mimeType, expiresAt };
  }
  return null;
}

/** Storage used and available for this site, from the Storage API estimate. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || !estimate.quota) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota };
  } catch {
    return null;
  }
}

/** Tests only: forget the in memory lists. */
export function resetDownloadsForTests() {
  indexes.clear();
  progress.clear();
  emit();
}
