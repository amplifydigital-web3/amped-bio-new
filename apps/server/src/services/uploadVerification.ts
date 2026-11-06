/**
 * Shared confirm step for every presigned upload flow.
 *
 * Before this, confirm routes only checked that an object existed. A client
 * could declare a 1 MB JPG, upload 500 MB of anything, and the record was
 * marked COMPLETED. Now every confirm route calls assertUploadVerified, which
 * checks size and real type and removes a bad upload so it is never served.
 * See docs/fixes/uploads-sdk-v3-validation.md.
 */
import { TRPCError } from "@trpc/server";
import { s3Service } from "./S3Service";
import { uploadedFileService } from "./UploadedFileService";
import type { UploadVerificationFailure } from "./s3Upload";

/** The fields of an UploadedFile row this step reads. */
export interface UploadedFileRecord {
  id: number;
  s3_key: string;
  bucket: string;
  size: bigint | number | null;
  file_type: string | null;
}

/** Plain messages shown to the person who uploaded. */
export const UPLOAD_VERIFICATION_MESSAGES: Record<UploadVerificationFailure, string> = {
  missing: "File not found in storage. Please upload the file first.",
  size_mismatch: "The uploaded file does not match the file you selected. Please upload it again.",
  type_mismatch:
    "This file's contents do not match a supported file type. Please choose another file.",
};

/**
 * Verify an upload and throw a BAD_REQUEST TRPCError if it fails.
 *
 * On a size or type failure the object is deleted from storage and the record
 * is marked DELETED, so a bad file can never be attached or served. A missing
 * object leaves the record PENDING so the client can retry the PUT while the
 * URL is still valid.
 */
export async function assertUploadVerified(
  uploadedFile: UploadedFileRecord,
  allowedTypes: readonly string[]
): Promise<void> {
  const result = await s3Service.verifyUpload({
    fileKey: uploadedFile.s3_key,
    bucket: uploadedFile.bucket,
    expectedSize: uploadedFile.size,
    declaredType: uploadedFile.file_type,
    allowedTypes,
  });

  if (result.ok) return;

  if (result.reason !== "missing") {
    console.warn(
      "[WARN] Rejected upload",
      JSON.stringify({
        fileId: uploadedFile.id,
        fileKey: uploadedFile.s3_key,
        reason: result.reason,
        detail: result.detail,
      })
    );
    try {
      await s3Service.deleteFile(uploadedFile.s3_key);
    } catch (error) {
      console.error(
        "[ERROR] Failed to delete rejected upload",
        error instanceof Error ? error.message : error,
        JSON.stringify({ fileId: uploadedFile.id, fileKey: uploadedFile.s3_key })
      );
    }
    await uploadedFileService.updateFileStatus({ id: uploadedFile.id, status: "DELETED" });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: UPLOAD_VERIFICATION_MESSAGES[result.reason],
  });
}
