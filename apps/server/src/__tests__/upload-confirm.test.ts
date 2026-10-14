/**
 * PR fix/uploads-sdk-v3-validation. The confirm step shared by every upload
 * route.
 * See docs/fixes/uploads-sdk-v3-validation.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const storage = vi.hoisted(() => ({
  verifyUpload: vi.fn(),
  deleteFile: vi.fn(),
}));
const files = vi.hoisted(() => ({ updateFileStatus: vi.fn() }));

vi.mock("../services/S3Service", () => ({ s3Service: storage }));
vi.mock("../services/UploadedFileService", () => ({ uploadedFileService: files }));

import { assertUploadVerified, UPLOAD_VERIFICATION_MESSAGES } from "../services/uploadVerification";

const record = {
  id: 77,
  s3_key: "profiles/1700000000000-abc-7.png",
  bucket: "amped-test",
  size: BigInt(2048),
  file_type: "image/png",
};
const ALLOWED = ["image/jpeg", "image/png"];

describe("assertUploadVerified", () => {
  beforeEach(() => {
    storage.verifyUpload.mockReset();
    storage.deleteFile.mockReset();
    files.updateFileStatus.mockReset();
  });

  it("passes the record's declared size and type to the storage check", async () => {
    storage.verifyUpload.mockResolvedValue({ ok: true, size: 2048, detectedType: "image/png" });
    await expect(assertUploadVerified(record, ALLOWED)).resolves.toBeUndefined();
    expect(storage.verifyUpload).toHaveBeenCalledWith({
      fileKey: record.s3_key,
      bucket: record.bucket,
      expectedSize: record.size,
      declaredType: "image/png",
      allowedTypes: ALLOWED,
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(files.updateFileStatus).not.toHaveBeenCalled();
  });

  it.each(["size_mismatch", "type_mismatch"] as const)(
    "on %s deletes the object, marks the record DELETED and throws BAD_REQUEST",
    async reason => {
      storage.verifyUpload.mockResolvedValue({ ok: false, reason, detail: "test" });
      await expect(assertUploadVerified(record, ALLOWED)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: UPLOAD_VERIFICATION_MESSAGES[reason],
      });
      expect(storage.deleteFile).toHaveBeenCalledWith(record.s3_key);
      expect(files.updateFileStatus).toHaveBeenCalledWith({ id: 77, status: "DELETED" });
    }
  );

  it("still marks the record DELETED if the storage delete fails", async () => {
    storage.verifyUpload.mockResolvedValue({ ok: false, reason: "type_mismatch", detail: "x" });
    storage.deleteFile.mockRejectedValue(new Error("network"));
    await expect(assertUploadVerified(record, ALLOWED)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(files.updateFileStatus).toHaveBeenCalledWith({ id: 77, status: "DELETED" });
  });

  it("on a missing object leaves the record PENDING so the client can retry", async () => {
    storage.verifyUpload.mockResolvedValue({ ok: false, reason: "missing", detail: "x" });
    await expect(assertUploadVerified(record, ALLOWED)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: UPLOAD_VERIFICATION_MESSAGES.missing,
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(files.updateFileStatus).not.toHaveBeenCalled();
  });
});
