import { describe, expect, it, vi } from "vitest";
import { rowView } from "./lib/rows";
import type { UploadEntry } from "./lib/uploadQueue";

vi.mock("@repo/ui", async () => ({
  ...(await import("./testUi").then(m => m.prismUi())),
  Notice: () => null,
}));
vi.mock("./lib/uploads", () => ({ useUploads: () => ({ queue: {}, entries: [] }) }));

const MB = 1024 * 1024;

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
