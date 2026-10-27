import { describe, expect, it, vi } from "vitest";
import {
  ContentApiError,
  TransferError,
  UploadTask,
  type TusOptions,
  type UploadDeps,
  type UploadTarget,
} from "./uploadTask";

const MB = 1024 * 1024;

function makeFile(size: number, name = "a.wav") {
  return new File([new Uint8Array(size)], name, { type: "audio/wav" });
}

function harness(target: UploadTarget, overrides: Partial<UploadDeps> = {}) {
  const puts: { url: string; size: number }[] = [];
  const api = {
    createUpload: vi.fn(async () => ({ publicId: "abcdefgh12345678", target })),
    signParts: vi.fn(async ({ partNumbers }: { partNumbers: number[] }) => ({
      parts: partNumbers.map(n => ({ partNumber: n, url: `https://r2/part/${n}` })),
    })),
    completeUpload: vi.fn(async () => ({ publicId: "abcdefgh12345678", status: "processing" })),
    abortUpload: vi.fn(async () => ({})),
  };
  const deps: UploadDeps = {
    api,
    put: vi.fn(async (url: string, body: Blob, opts) => {
      puts.push({ url, size: body.size });
      opts.onProgress(body.size);
      return { etag: `"etag-${url.split("/").pop()}"` };
    }),
    tus: vi.fn(),
    sleep: vi.fn(async () => {}),
    isOnline: () => true,
    ...overrides,
  };
  return { api, deps, puts };
}

describe("UploadTask, single PUT", () => {
  it("creates, sends the whole file with the signed headers and completes", async () => {
    const target: UploadTarget = {
      type: "put",
      url: "https://r2/put",
      headers: { "Content-Type": "audio/wav" },
    };
    const { api, deps, puts } = harness(target);
    const task = new UploadTask(
      { file: makeFile(3 * MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(api.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "audio", fileName: "a.wav", size: 3 * MB })
    );
    expect(puts).toEqual([{ url: "https://r2/put", size: 3 * MB }]);
    expect(deps.put).toHaveBeenCalledWith(
      "https://r2/put",
      expect.any(File),
      expect.objectContaining({ headers: { "Content-Type": "audio/wav" } })
    );
    expect(api.completeUpload).toHaveBeenCalledWith({ publicId: "abcdefgh12345678" });
    expect(task.snapshot.phase).toBe("processing");
    expect(task.snapshot.loaded).toBe(3 * MB);
  });

  it("shows the server's message when createUpload refuses", async () => {
    const { api, deps } = harness({ type: "put", url: "u", headers: {} });
    api.createUpload.mockRejectedValueOnce(
      new ContentApiError(
        "BAD_REQUEST",
        "Not enough storage left for this file. Delete an item or ask for more space."
      )
    );
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("failed");
    expect(task.snapshot.error).toMatch(/Not enough storage/);
  });

  it("never shows raw text from a server error", async () => {
    const { api, deps } = harness({ type: "put", url: "u", headers: {} });
    api.createUpload.mockRejectedValueOnce(
      new ContentApiError("INTERNAL_SERVER_ERROR", "prisma exploded")
    );
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.error).toBe("Something went wrong. Try again.");
  });

  it("retries a dropped PUT, then fails and starts over on Retry", async () => {
    const { api, deps } = harness({ type: "put", url: "u", headers: {} });
    (deps.put as ReturnType<typeof vi.fn>).mockRejectedValue(new TransferError("network", null));
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(deps.put).toHaveBeenCalledTimes(5);
    expect(task.snapshot.phase).toBe("failed");
    expect(task.snapshot.error).toBe("The upload stopped. Try again.");

    // Retry: the old item is removed and a fresh signed URL is used
    (deps.put as ReturnType<typeof vi.fn>).mockResolvedValue({ etag: null });
    await task.run();
    expect(api.abortUpload).toHaveBeenCalledWith({
      publicId: "abcdefgh12345678",
      uploadId: undefined,
    });
    expect(api.createUpload).toHaveBeenCalledTimes(2);
    expect(task.snapshot.phase).toBe("processing");
  });

  it("goes to offline instead of failing when the network is gone", async () => {
    let online = true;
    const { deps } = harness({ type: "put", url: "u", headers: {} }, { isOnline: () => online });
    (deps.put as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      online = false;
      throw new TransferError("network", null);
    });
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("offline");
  });
});

describe("UploadTask, review fixes", () => {
  const putTarget: UploadTarget = { type: "put", url: "https://r2/put", headers: {} };

  it("a network blip at completeUpload is asked again, without sending again", async () => {
    const { api, deps } = harness(putTarget);
    api.completeUpload
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ publicId: "abcdefgh12345678", status: "processing" });
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    expect(deps.put).toHaveBeenCalledTimes(1);
    expect(api.createUpload).toHaveBeenCalledTimes(1);
  });

  it("Retry after completeUpload kept failing does not send the bytes again", async () => {
    const { api, deps } = harness(putTarget);
    api.completeUpload.mockRejectedValue(new TypeError("Failed to fetch"));
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("failed");
    api.completeUpload.mockResolvedValue({ publicId: "abcdefgh12345678", status: "processing" });
    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    expect(deps.put).toHaveBeenCalledTimes(1);
    expect(api.abortUpload).not.toHaveBeenCalled();
  });

  it("a slow Stream finish never deletes the sent video on Retry", async () => {
    const tus = vi.fn((_file: File, options: TusOptions) => ({
      start: () => options.onSuccess(),
      abort: vi.fn(async () => {}),
    }));
    const { api, deps } = harness(
      { type: "stream", uploadUrl: "https://tus/abc", chunkBytes: 50 * MB },
      { tus }
    );
    api.completeUpload.mockRejectedValue(
      new ContentApiError("BAD_REQUEST", "File not found in storage. Please upload the file first.")
    );
    const task = new UploadTask(
      { file: makeFile(MB, "a.mp4"), kind: "video", mimeType: "video/mp4" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("failed");
    api.completeUpload.mockResolvedValue({ publicId: "abcdefgh12345678", status: "processing" });
    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    expect(api.abortUpload).not.toHaveBeenCalled();
    expect(tus).toHaveBeenCalledTimes(1);
  });

  it("an expired PUT URL after a long pause replaces the item once and sends again", async () => {
    const { api, deps } = harness(putTarget);
    (deps.put as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new TransferError("expired", 403))
      .mockResolvedValueOnce({ etag: null });
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    expect(api.abortUpload).toHaveBeenCalledTimes(1);
    expect(api.createUpload).toHaveBeenCalledTimes(2);
  });

  it("cancel while createUpload is in flight removes the item it creates", async () => {
    let release!: () => void;
    const { api, deps } = harness(putTarget);
    api.createUpload.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ publicId: "abcdefgh12345678", target: putTarget });
        })
    );
    const task = new UploadTask(
      { file: makeFile(MB), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    void task.run();
    const canceled = task.cancel();
    release();
    await canceled;
    expect(api.abortUpload).toHaveBeenCalledWith({
      publicId: "abcdefgh12345678",
      uploadId: undefined,
    });
    expect(deps.put).not.toHaveBeenCalled();
  });
});

describe("UploadTask, multipart", () => {
  const size = 25 * MB;
  const target: UploadTarget = {
    type: "multipart",
    uploadId: "mp-1",
    partCount: 3,
    partBytes: 10 * MB,
  };

  it("sends 10 MB parts and completes with sorted ETags", async () => {
    const { api, deps, puts } = harness(target);
    const task = new UploadTask(
      { file: makeFile(size), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(puts.map(p => p.size).sort((a, b) => a - b)).toEqual([5 * MB, 10 * MB, 10 * MB]);
    expect(api.completeUpload).toHaveBeenCalledWith({
      publicId: "abcdefgh12345678",
      uploadId: "mp-1",
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
        { partNumber: 3, etag: '"etag-3"' },
      ],
    });
    expect(task.snapshot.phase).toBe("processing");
  });

  it("resumes after a pause without sending finished parts again", async () => {
    const ref: { task?: UploadTask } = {};
    let calls = 0;
    const { deps, puts } = harness(target, {
      put: vi.fn(async (url: string, body: Blob, opts: { signal: AbortSignal }) => {
        calls += 1;
        if (url.endsWith("/1")) {
          puts.push({ url, size: body.size });
          return { etag: '"etag-1"' };
        }
        // Parts 2 and 3 hang until the creator pauses
        if (calls <= 3) {
          queueMicrotask(() => ref.task!.pause());
          await new Promise((_, reject) =>
            opts.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError"))
            )
          );
        }
        puts.push({ url, size: body.size });
        return { etag: `"etag-${url.split("/").pop()}"` };
      }),
    });
    const task = new UploadTask(
      { file: makeFile(size), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    ref.task = task;
    await task.run();
    expect(task.snapshot.phase).toBe("paused");
    const sentBefore = puts.map(p => p.url);
    expect(sentBefore).toEqual(["https://r2/part/1"]);

    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    const resumed = puts
      .slice(1)
      .map(p => p.url)
      .sort();
    expect(resumed).toEqual(["https://r2/part/2", "https://r2/part/3"]);
  });

  it("re-signs a part when its URL expired", async () => {
    let first = true;
    const { api, deps } = harness(target, {
      put: vi.fn(async (url: string) => {
        if (url.endsWith("/2") && first) {
          first = false;
          throw new TransferError("expired", 403);
        }
        return { etag: `"etag-${url.split("/").pop()}"` };
      }),
    });
    const task = new UploadTask(
      { file: makeFile(size), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("processing");
    expect(api.signParts).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "mp-1", partNumbers: [2] })
    );
  });

  it("fails when storage gives no ETag (CORS does not expose it)", async () => {
    const { deps } = harness(target, { put: vi.fn(async () => ({ etag: null })) });
    const task = new UploadTask(
      { file: makeFile(size), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("failed");
  });

  it("cancel aborts the multipart upload on the server", async () => {
    const { api, deps } = harness(target);
    const task = new UploadTask(
      { file: makeFile(size), kind: "audio", mimeType: "audio/wav" },
      deps,
      () => {}
    );
    // Create the item, then pause before parts go
    api.signParts.mockImplementationOnce(async () => {
      task.pause();
      return { parts: [] };
    });
    await task.run();
    await task.cancel();
    expect(api.abortUpload).toHaveBeenCalledWith({
      publicId: "abcdefgh12345678",
      uploadId: "mp-1",
    });
  });
});

describe("UploadTask, Stream video", () => {
  const target: UploadTarget = {
    type: "stream",
    uploadUrl: "https://upload.videodelivery.net/tus/abc",
    chunkBytes: 50 * MB,
  };

  function fakeTus(behavior: (options: TusOptions) => void) {
    return vi.fn((_file: File, options: TusOptions) => ({
      start: () => behavior(options),
      abort: vi.fn(async () => {}),
    }));
  }

  it("resumes into the server's TUS URL with 50 MB chunks and sends the duration", async () => {
    const tus = fakeTus(options => {
      options.onProgress(5 * MB, 5 * MB);
      options.onSuccess();
    });
    const { api, deps } = harness(target, { tus });
    const task = new UploadTask(
      { file: makeFile(5 * MB, "a.mp4"), kind: "video", mimeType: "video/mp4", durationSec: 61.2 },
      deps,
      () => {}
    );
    await task.run();
    expect(api.createUpload).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 62 }));
    expect(tus).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ uploadUrl: target.uploadUrl, chunkSize: 50 * MB })
    );
    expect(task.snapshot.phase).toBe("processing");
  });

  it("asks again while Stream still reports the upload as pending", async () => {
    const tus = fakeTus(options => options.onSuccess());
    const { api, deps } = harness(target, { tus });
    api.completeUpload
      .mockRejectedValueOnce(
        new ContentApiError(
          "BAD_REQUEST",
          "File not found in storage. Please upload the file first."
        )
      )
      .mockResolvedValueOnce({ publicId: "abcdefgh12345678", status: "processing" });
    const task = new UploadTask(
      { file: makeFile(MB, "a.mp4"), kind: "video", mimeType: "video/mp4" },
      deps,
      () => {}
    );
    await task.run();
    expect(api.completeUpload).toHaveBeenCalledTimes(2);
    expect(task.snapshot.phase).toBe("processing");
  });

  it("starts over when the TUS URL has expired", async () => {
    const tus = fakeTus(options =>
      options.onError(Object.assign(new Error("gone"), { status: 404 }))
    );
    const { deps } = harness(target, { tus });
    const task = new UploadTask(
      { file: makeFile(MB, "a.mp4"), kind: "video", mimeType: "video/mp4" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.phase).toBe("failed");
    expect(task.snapshot.error).toMatch(/expired/);
  });

  it("a video the server can not read fails with its message", async () => {
    const tus = fakeTus(options => options.onSuccess());
    const { api, deps } = harness(target, { tus });
    api.completeUpload.mockRejectedValue(
      new ContentApiError("BAD_REQUEST", "This video could not be read. Try another file.")
    );
    const task = new UploadTask(
      { file: makeFile(MB, "a.mp4"), kind: "video", mimeType: "video/mp4" },
      deps,
      () => {}
    );
    await task.run();
    expect(task.snapshot.error).toBe("This video could not be read. Try another file.");
  });
});
