/**
 * Fan Library offline downloads (Build Board #26, FL-5, spec 3.5 Offline,
 * decision C, board m10): the device store, the access check, the 30 day
 * window, Wi-Fi only, sign out, the player source and the Downloads screen.
 * Cache Storage and the network are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { LibraryDownloadGrant, LibraryItem } from "@repo/constants";
import { LIBRARY_COPY } from "../copy";
import { DownloadsPage, formatBytes } from "./DownloadsPage";
import {
  DownloadFailed,
  checkDownloads,
  clearAll,
  clearDevice,
  deviceId,
  findDownload,
  flushPending,
  localSource,
  offlineWindowOpen,
  readIndex,
  removeStored,
  resetDownloadsForTests,
  setWifiOnly,
  startDownload,
  type DownloadsApi,
} from "./store";

const D = LIBRARY_COPY.downloads;
const FAN = 7;

// ---------------------------------------------------------------- fakes

class FakeCache {
  entries = new Map<string, Response>();
  async put(key: string, response: Response) {
    // Read the body the way a real cache does, so a stream is consumed
    const blob = await response.blob();
    this.entries.set(key, new Response(blob, { headers: response.headers }));
  }
  async match(key: string) {
    const hit = this.entries.get(key);
    return hit ? hit.clone() : undefined;
  }
  async delete(key: string) {
    return this.entries.delete(key);
  }
}
let cache: FakeCache;

function libraryItem(extra: Partial<LibraryItem> = {}): LibraryItem {
  return {
    publicId: "abcd1234efgh5678",
    kind: "video",
    title: "Studio tour",
    durationMs: 760_000,
    pageCount: null,
    publishedAt: null,
    cover: null,
    blur: null,
    allowDownload: true,
    owner: { handle: "maya", name: "Maya Lin", image: null, accent: "#ff6a3d" },
    accessSource: "public",
    planName: null,
    progress: null,
    savedAt: null,
    ...extra,
  };
}

function fakeApi(): DownloadsApi & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { record: [], mark: [], remove: [], check: [] };
  return {
    calls,
    recordDownload: vi.fn(async input => {
      calls.record!.push(input);
      return {
        id: "a".repeat(32),
        item: libraryItem({ publicId: input.publicId }),
        url: "https://usercontent.amped.bio/file?t=1",
        fileName: "studio-tour.mp4",
        expiresAt: Date.now() + 120_000,
      } satisfies LibraryDownloadGrant;
    }),
    markDownloaded: vi.fn(async input => {
      calls.mark!.push(input);
      return { ok: true };
    }),
    removeDownload: vi.fn(async input => {
      calls.remove!.push(input);
      return { ok: true };
    }),
    downloadsCheck: vi.fn(async input => {
      calls.check!.push(input);
      return { allowed: input.ids, removed: [], checkedAt: new Date().toISOString() };
    }),
  };
}

const FILE = new Uint8Array(4096).fill(7);

beforeEach(() => {
  localStorage.clear();
  resetDownloadsForTests();
  cache = new FakeCache();
  vi.stubGlobal("caches", { open: async () => cache, delete: async () => true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(FILE, {
          status: 200,
          headers: { "Content-Type": "video/mp4", "Content-Length": "4096" },
        })
    )
  );
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------- store

describe("startDownload", () => {
  it("records, fetches into the cache and lists the copy with its size", async () => {
    const api = fakeApi();
    const stored = await startDownload(api, FAN, libraryItem());
    expect(api.calls.record).toEqual([{ publicId: "abcd1234efgh5678", device: deviceId() }]);
    expect(fetch).toHaveBeenCalledWith("https://usercontent.amped.bio/file?t=1", {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    expect(stored.bytes).toBe(4096);
    expect(api.calls.mark).toEqual([{ id: "a".repeat(32), bytes: 4096 }]);
    const file = await cache.match("/downloads/abcd1234efgh5678");
    expect(file?.headers.get("Content-Type")).toBe("video/mp4");
    expect(findDownload(FAN, "abcd1234efgh5678")?.title).toBe("Studio tour");
    // The first download opens the offline window
    expect(offlineWindowOpen(readIndex(FAN))).toBe(true);
  });

  it("leaves nothing behind when the file does not arrive", async () => {
    const api = fakeApi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 }))
    );
    await expect(startDownload(api, FAN, libraryItem())).rejects.toMatchObject({
      reason: "network",
    });
    expect(api.calls.remove).toEqual([{ id: "a".repeat(32) }]);
    expect(cache.entries.size).toBe(0);
    expect(readIndex(FAN).items).toEqual([]);
  });

  it("refuses items the creator does not allow, photos and Wi-Fi only on cellular", async () => {
    const api = fakeApi();
    await expect(
      startDownload(api, FAN, libraryItem({ allowDownload: false }))
    ).rejects.toBeInstanceOf(DownloadFailed);
    await expect(startDownload(api, FAN, libraryItem({ kind: "image" }))).rejects.toMatchObject({
      reason: "refused",
    });
    vi.stubGlobal("navigator", { ...navigator, connection: { type: "cellular" } });
    await expect(startDownload(api, FAN, libraryItem())).rejects.toMatchObject({ reason: "wifi" });
    setWifiOnly(false);
    await expect(startDownload(api, FAN, libraryItem())).resolves.toMatchObject({ bytes: 4096 });
    expect(api.calls.record).toHaveLength(1);
  });

  it("names a device id that is random and stable, never a fingerprint", () => {
    const id = deviceId();
    expect(id).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(deviceId()).toBe(id);
  });
});

describe("the access check", () => {
  it("deletes copies the fan may no longer keep and says why", async () => {
    const api = fakeApi();
    await startDownload(api, FAN, libraryItem());
    api.downloadsCheck = vi.fn(async () => ({
      allowed: [],
      removed: [{ id: "a".repeat(32), reason: "access" as const }],
      checkedAt: "2026-11-05T12:00:00.000Z",
    }));
    await checkDownloads(api, FAN);
    expect(cache.entries.size).toBe(0);
    expect(readIndex(FAN).items).toEqual([]);
    expect(readIndex(FAN).removed).toEqual([{ title: "Studio tour", reason: "access" }]);
    expect(readIndex(FAN).lastCheckAt).toBe("2026-11-05T12:00:00.000Z");
  });

  it("opens offline for 30 days after the last check, then asks for a connection", async () => {
    await startDownload(fakeApi(), FAN, libraryItem());
    const index = readIndex(FAN);
    const at = Date.parse(index.lastCheckAt!);
    expect(offlineWindowOpen(index, at + 29 * 86_400_000)).toBe(true);
    expect(offlineWindowOpen(index, at + 31 * 86_400_000)).toBe(false);
  });
});

describe("the player source", () => {
  it("plays a video copy as an MP4 from the device, and an audio copy as a file", async () => {
    await startDownload(fakeApi(), FAN, libraryItem());
    expect(localSource(FAN, "abcd1234efgh5678")).toMatchObject({
      kind: "video",
      mp4: "/downloads/abcd1234efgh5678",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FILE, { headers: { "Content-Type": "audio/mpeg" } }))
    );
    await startDownload(
      fakeApi(),
      FAN,
      libraryItem({ publicId: "zzzz1234efgh5678", kind: "audio" })
    );
    expect(localSource(FAN, "zzzz1234efgh5678")).toMatchObject({
      kind: "audio",
      src: "/downloads/zzzz1234efgh5678",
      mimeType: "audio/mpeg",
    });
    // The player's refresh timer must stay under the 24.8 day setTimeout limit
    const video = localSource(FAN, "abcd1234efgh5678")!;
    expect(video.expiresAt - Date.now()).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
    expect(video.expiresAt - Date.now()).toBeGreaterThan(5 * 60 * 60 * 1000);
    expect(localSource(FAN, "nope1234efgh5678")).toBeNull();
    expect(localSource(null, "abcd1234efgh5678")).toBeNull();
  });
});

describe("removing", () => {
  it("Remove and Clear all delete the files and tell the server", async () => {
    const api = fakeApi();
    await startDownload(api, FAN, libraryItem());
    await removeStored(api, FAN, "abcd1234efgh5678");
    expect(cache.entries.size).toBe(0);
    expect(api.calls.remove).toEqual([{ id: "a".repeat(32) }]);
    await startDownload(api, FAN, libraryItem());
    await clearAll(api, FAN);
    expect(readIndex(FAN).items).toEqual([]);
    expect(api.calls.remove).toHaveLength(2);
  });

  it("a removal made offline reaches the server at the next check", async () => {
    const api = fakeApi();
    await startDownload(api, FAN, libraryItem());
    await removeStored(null, FAN, "abcd1234efgh5678");
    expect(readIndex(FAN).pending).toEqual(["a".repeat(32)]);
    await flushPending(api, FAN);
    expect(api.calls.remove).toEqual([{ id: "a".repeat(32) }]);
    expect(readIndex(FAN).pending).toEqual([]);
  });

  it("signing out, or another account, deletes the copies", async () => {
    await startDownload(fakeApi(), FAN, libraryItem());
    await clearDevice(FAN);
    expect(readIndex(FAN).items).toHaveLength(1);
    await clearDevice(8);
    resetDownloadsForTests();
    expect(readIndex(FAN).items).toEqual([]);
    expect(localStorage.getItem(`amped.downloads.${FAN}`)).toBeNull();
    expect(cache.entries.size).toBe(0);
  });
});

// ---------------------------------------------------------------- screen

describe("Downloads (board m10, row 129)", () => {
  function renderPage(online = true) {
    const api = fakeApi();
    render(
      <MemoryRouter>
        <DownloadsPage account={FAN} online={online} api={api} />
      </MemoryRouter>
    );
    return api;
  }

  it("shows the empty state, Wi-Fi only on by default, and the rules", () => {
    renderPage();
    expect(screen.getByText(D.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("switch", { name: D.wifiOnly }).getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(screen.getByText(D.rules)).toBeTruthy();
  });

  it("lists a copy with its owner and size; Clear all asks first", async () => {
    await startDownload(fakeApi(), FAN, libraryItem());
    const api = renderPage();
    expect(screen.getByText("Studio tour")).toBeTruthy();
    expect(screen.getByText("Maya Lin")).toBeTruthy();
    expect(screen.getByText("4 KB")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: D.clearAll }));
    expect(screen.getByText(D.clearTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: D.clearConfirm }));
    await waitFor(() => expect(screen.getByText(D.emptyTitle)).toBeTruthy());
    expect(api.calls.remove).toHaveLength(1);
  });

  it("tells the fan which copies a check removed, and why", async () => {
    const api = fakeApi();
    await startDownload(api, FAN, libraryItem());
    api.downloadsCheck = vi.fn(async () => ({
      allowed: [],
      removed: [{ id: "a".repeat(32), reason: "unavailable" as const }],
      checkedAt: new Date().toISOString(),
    }));
    await checkDownloads(api, FAN);
    renderPage();
    expect(screen.getByText(D.removedTitle(1))).toBeTruthy();
    expect(screen.getByText(`Studio tour. ${D.removedBody.unavailable}.`)).toBeTruthy();
  });

  it("offline: says so", () => {
    renderPage(false);
    expect(screen.getByText(D.offlineTitle)).toBeTruthy();
  });

  it("formats sizes", () => {
    expect(formatBytes(4096)).toBe("4 KB");
    expect(formatBytes(340 * 1024 * 1024)).toBe("340 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });
});
