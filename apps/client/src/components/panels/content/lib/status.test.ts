import { describe, expect, it } from "vitest";
import { failureLine, itemStatus, type ItemStatusInput } from "./status";

const base: ItemStatusInput = {
  status: "ready",
  publishState: "draft",
  moderationState: "clear",
  processingStep: "done",
  failureReason: null,
};

describe("itemStatus", () => {
  it("names one status per item, as cs1 shows them", () => {
    expect(itemStatus(base).label).toBe("Draft");
    expect(itemStatus({ ...base, publishState: "published" }).label).toBe("Public");
    expect(itemStatus({ ...base, moderationState: "held" }).label).toBe("In review");
    expect(itemStatus({ ...base, status: "processing", processingStep: "encoding" })).toMatchObject(
      {
        label: "Processing",
        line: "Encoding on Stream",
      }
    );
    expect(itemStatus({ ...base, status: "processing", processingStep: "malware" }).line).toBe(
      "Scanning before it goes live"
    );
    expect(itemStatus({ ...base, status: "blocked", moderationState: "blocked" }).label).toBe(
      "Blocked"
    );
  });

  it("a held item stays In review even when published", () => {
    expect(itemStatus({ ...base, publishState: "published", moderationState: "held" }).key).toBe(
      "review"
    );
  });

  it("failed items carry a line with the fix", () => {
    const s = itemStatus({ ...base, status: "failed", failureReason: "pdf_encrypted" });
    expect(s.label).toBe("Processing failed");
    expect(s.line).toMatch(/password/);
  });
});

describe("failureLine", () => {
  it("maps API, Stream and processor reasons", () => {
    expect(failureLine("size_mismatch")).toMatch(/does not match/);
    expect(failureLine("stream:ERR_NON_VIDEO")).toMatch(/video could not be read/);
    expect(failureLine("archive_ratio")).toMatch(/ZIP/);
    expect(failureLine("upload_expired")).toMatch(/expired/);
  });

  it("never shows an unknown reason code", () => {
    expect(failureLine("scan_failed")).toBe(
      "Processing did not finish. Remove it and upload the file again."
    );
    expect(failureLine(null)).toMatch(/Processing did not finish/);
  });
});
