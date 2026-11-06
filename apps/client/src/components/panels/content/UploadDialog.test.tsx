import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CONTENT_COPY } from "./copy";
import { UploadDialog } from "./UploadDialog";
import { rowView } from "./lib/rows";
import { UploadQueue, type UploadEntry } from "./lib/uploadQueue";
import type { UploadDeps } from "./lib/uploadTask";
import type { StorageSnapshot } from "./lib/files";

const mocks = vi.hoisted(() => ({
  queue: null as unknown as UploadQueue,
}));

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  Notice: () => null,
}));

// The dialog reads the app wide queue through this hook, so the test drives a
// real queue and sees the row the preflight refuses
vi.mock("./lib/uploads", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useUploads: () => {
      const queue = mocks.queue;
      const entries = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
      return { queue, entries };
    },
  };
});

const MB = 1024 * 1024;
const GB = 1024 * MB;

const snapshot: StorageSnapshot = {
  bytesLimit: 5 * GB,
  bytesUsed: 2 * GB,
  bytesReserved: 0,
  videoMinutesLimit: 300,
  videoMinutesUsed: 84,
  limits: { video: 2 * GB, audio: 500 * MB, image: 25 * MB, document: 100 * MB, file: 500 * MB },
  videoUploadsOpen: false,
};

function makeQueue() {
  const createUpload = vi.fn(async () => ({
    publicId: "item000000000001",
    target: { type: "put" as const, url: "https://r2/harbor.mp4", headers: {} },
  }));
  const deps: UploadDeps = {
    api: {
      createUpload,
      signParts: vi.fn(),
      completeUpload: vi.fn(),
      abortUpload: vi.fn(),
    },
    put: vi.fn(),
    tus: vi.fn(),
    sleep: vi.fn(),
    isOnline: () => true,
  };
  const queue = new UploadQueue({
    deps,
    getItem: async () => {
      throw new Error("not used");
    },
    readDuration: async () => 60,
  });
  mocks.queue = queue;
  return { queue, createUpload };
}

function entry(over: Partial<UploadEntry> = {}): UploadEntry {
  return {
    id: "u1",
    name: "Harbor at night, full take.mov",
    size: 1800 * MB,
    kind: "video",
    previewUrl: null,
    rejected: null,
    upload: { phase: "uploading", loaded: 1116 * MB, total: 1800 * MB, publicId: "x", error: null },
    server: null,
    ...over,
  };
}

const server = {
  publicId: "x",
  title: "t",
  totalBytes: 1,
  status: "ready" as const,
  publishState: "draft" as const,
  moderationState: "clear" as const,
  processingStep: "done",
  failureReason: null,
};

describe("rowView (cs2, cs8)", () => {
  it("shows progress and that it resumes", () => {
    expect(rowView(entry())).toMatchObject({
      stage: "uploading",
      line: "Uploading 62%, resumes if your connection drops.",
    });
  });

  it("shows where an offline upload stopped", () => {
    const view = rowView(entry({ upload: { ...entry().upload!, phase: "offline" } }));
    expect(view.stage).toBe("offline");
    expect(view.line).toBe("Stopped at 62%, 1.09 GB of 1.76 GB");
  });

  it("names the fix for a refused file", () => {
    expect(
      rowView(entry({ rejected: "This file is larger than the 25 MB limit.", upload: null }))
    ).toMatchObject({
      stage: "failed",
      error: true,
      line: "This file is larger than the 25 MB limit.",
    });
  });

  it("follows the server after sending", () => {
    const sent = { upload: { ...entry().upload!, phase: "processing" as const } };
    expect(rowView(entry(sent)).line).toMatch(/Encoding on Stream/);
    expect(rowView(entry({ ...sent, server })).stage).toBe("ready");
    expect(rowView(entry({ ...sent, server: { ...server, moderationState: "held" } })).stage).toBe(
      "review"
    );
    expect(
      rowView(
        entry({ ...sent, server: { ...server, status: "blocked", moderationState: "blocked" } })
      )
    ).toMatchObject({ stage: "blocked", error: true });
    expect(
      rowView(
        entry({ ...sent, server: { ...server, status: "failed", failureReason: "type_mismatch" } })
      ).line
    ).toMatch(/do not match/);
  });
});

describe("UploadDialog with video uploads closed", () => {
  it("leaves video out of the picker and refuses a dropped video before any upload call", async () => {
    const { createUpload } = makeQueue();
    renderWithProviders(
      <UploadDialog
        open
        onOpenChange={vi.fn()}
        storage={snapshot}
        videoUploadsOpen={false}
        onOpenItem={vi.fn()}
      />
    );

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input!.accept).not.toContain(".mp4");
    expect(input!.accept).not.toContain(".mov");
    expect(input!.accept).toContain(".mp3");

    fireEvent.change(input!, {
      target: { files: [new File([], "harbor.mp4", { type: "video/mp4" })] },
    });

    expect(await screen.findByText(CONTENT_COPY.upload.videoClosed)).toBeInTheDocument();
    expect(createUpload).not.toHaveBeenCalled();
  });
});
