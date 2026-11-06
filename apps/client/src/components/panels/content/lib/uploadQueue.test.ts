import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadQueue, type ServerItem } from "./uploadQueue";
import type { StorageSnapshot } from "./files";
import type { UploadDeps } from "./uploadTask";

const MB = 1024 * 1024;
const GB = 1024 * MB;

const storage: StorageSnapshot = {
  bytesLimit: 5 * GB,
  bytesUsed: 0,
  bytesReserved: 0,
  videoMinutesLimit: 300,
  videoMinutesUsed: 0,
  limits: { video: 2 * GB, audio: 500 * MB, image: 25 * MB, document: 100 * MB, file: 500 * MB },
};

// A File that reports a size without allocating it
function file(name: string, size: number, type: string) {
  const f = new File([], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function setup(
  options: { online?: () => boolean; getItem?: (id: string) => Promise<ServerItem> } = {}
) {
  let n = 0;
  const releases: (() => void)[] = [];
  const order: string[] = [];
  const deps: UploadDeps = {
    api: {
      createUpload: vi.fn(async input => {
        order.push(input.fileName);
        n += 1;
        return {
          publicId: `item${String(n).padStart(12, "0")}`,
          target: { type: "put" as const, url: `https://r2/${input.fileName}`, headers: {} },
        };
      }),
      signParts: vi.fn(),
      completeUpload: vi.fn(async ({ publicId }) => ({ publicId, status: "processing" })),
      abortUpload: vi.fn(async () => ({})),
    },
    // Each PUT waits until the test releases it
    put: vi.fn(
      (_url: string, body: Blob, opts: { onProgress(n: number): void; signal: AbortSignal }) =>
        new Promise<{ etag: string | null }>((resolve, reject) => {
          releases.push(() => {
            opts.onProgress(body.size);
            resolve({ etag: null });
          });
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    ),
    tus: vi.fn(),
    sleep: vi.fn(async () => {}),
    isOnline: options.online ?? (() => true),
  };
  const changed: string[] = [];
  const queue = new UploadQueue({
    deps,
    getItem:
      options.getItem ??
      (async publicId => ({
        publicId,
        title: "t",
        totalBytes: 1,
        status: "ready",
        publishState: "draft",
        moderationState: "clear",
        processingStep: "done",
        failureReason: null,
      })),
    onItemChange: id => changed.push(id),
    pollMs: [10],
    readDuration: async () => 120,
  });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  return { queue, deps, releases, order, changed, flush };
}

describe("UploadQueue", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("sends one file at a time, in order", async () => {
    const { queue, releases, order, flush } = setup();
    await queue.add(
      [file("a.mp3", MB, "audio/mpeg"), file("b.pdf", MB, "application/pdf")],
      storage
    );
    await flush();
    expect(order).toEqual(["a.mp3"]);
    expect(queue.getSnapshot()[1]!.upload!.phase).toBe("waiting");
    releases.shift()!();
    await flush();
    await flush();
    expect(order).toEqual(["a.mp3", "b.pdf"]);
  });

  it("keeps refused files as rows with the reason and sends nothing for them", async () => {
    const { queue, deps } = setup();
    await queue.add([file("setup.exe", MB, "application/octet-stream")], storage);
    const [row] = queue.getSnapshot();
    expect(row!.rejected).toMatch(/not supported/);
    expect(deps.api.createUpload).not.toHaveBeenCalled();
    queue.dismiss(row!.id);
    expect(queue.getSnapshot()).toHaveLength(0);
  });

  it("refuses a batch that overflows storage before any bytes are sent", async () => {
    const { queue, deps } = setup();
    const tight = { ...storage, bytesUsed: 5 * GB - 600 * MB };
    await queue.add(
      [file("a.zip", 400 * MB, "application/zip"), file("b.zip", 400 * MB, "application/zip")],
      tight
    );
    const rows = queue.getSnapshot();
    expect(rows[0]!.rejected).toBeNull();
    expect(rows[1]!.rejected).toMatch(/Not enough storage/);
    expect(deps.api.createUpload).toHaveBeenCalledTimes(1);
  });

  it("polls the item after sending until the server settles it", async () => {
    const { queue, releases, changed, flush } = setup();
    await queue.add([file("a.mp3", MB, "audio/mpeg")], storage);
    await flush();
    releases.shift()!();
    await new Promise(resolve => setTimeout(resolve, 40));
    const [row] = queue.getSnapshot();
    expect(row!.upload!.phase).toBe("processing");
    expect(row!.server?.status).toBe("ready");
    // Created, sent and settled each refresh the library
    expect(changed.length).toBeGreaterThanOrEqual(3);
    queue.clearSettled();
    expect(queue.getSnapshot()).toHaveLength(0);
  });

  it("pauses on offline and resumes on online", async () => {
    let online = true;
    const { queue, deps, releases, flush } = setup({ online: () => online });
    await queue.add([file("a.mp3", MB, "audio/mpeg")], storage);
    await flush();
    online = false;
    queue.goOffline();
    await flush();
    expect(queue.getSnapshot()[0]!.upload!.phase).toBe("offline");
    online = true;
    queue.goOnline();
    await flush();
    expect(deps.put).toHaveBeenCalledTimes(2);
    releases.pop()!();
    await flush();
    await flush();
    expect(queue.getSnapshot()[0]!.upload!.phase).toBe("processing");
  });

  it("back online, an offline file waits when another file is already sending", async () => {
    let online = true;
    const { queue, flush } = setup({ online: () => online });
    await queue.add([file("a.mp3", MB, "audio/mpeg"), file("c.mp3", MB, "audio/mpeg")], storage);
    await flush();
    const [a, c] = queue.getSnapshot();
    online = false;
    queue.goOffline();
    await flush();
    online = true;
    // The creator starts c by hand before the online event arrives
    queue.resume(c!.id);
    expect(queue.getSnapshot()[1]!.upload!.phase).toBe("waiting");
    queue.goOnline();
    await flush();
    const phases = queue.getSnapshot().map(e => e.upload!.phase);
    expect(phases.filter(p => p === "uploading" || p === "preparing")).toHaveLength(1);
    expect(queue.getSnapshot().find(e => e.id === a!.id)!.upload!.phase).not.toBe("offline");
  });

  it("cancel deletes the server item and starts the next file", async () => {
    const { queue, deps, order, flush } = setup();
    await queue.add([file("a.mp3", MB, "audio/mpeg"), file("b.mp3", MB, "audio/mpeg")], storage);
    await flush();
    const first = queue.getSnapshot()[0]!;
    await queue.cancel(first.id);
    await flush();
    expect(deps.api.abortUpload).toHaveBeenCalledWith({
      publicId: "item000000000001",
      uploadId: undefined,
    });
    expect(order).toEqual(["a.mp3", "b.mp3"]);
    expect(queue.getSnapshot()).toHaveLength(1);
  });

  it("a paused file resumed while another sends waits its turn", async () => {
    const { queue, flush } = setup();
    await queue.add([file("a.mp3", MB, "audio/mpeg"), file("b.mp3", MB, "audio/mpeg")], storage);
    await flush();
    const [a] = queue.getSnapshot();
    queue.pause(a!.id);
    await flush();
    await flush();
    // b is sending now; resuming a puts it back in line
    queue.resume(a!.id);
    expect(queue.getSnapshot()[0]!.upload!.phase).toBe("waiting");
  });
});
