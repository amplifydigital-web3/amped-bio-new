/**
 * Cloudflare R2 for the content system (Build Board #20). Spec 3.4 and 3.5.
 *
 * R2 speaks the S3 API, so this reuses AWS SDK v3 and the helpers from PR 1
 * (services/s3Upload.ts). Presigned URLs only work on the account's S3 endpoint
 * (https://{account}.r2.cloudflarestorage.com), never on a custom domain, so the
 * browser uploads there and viewers read through the media gateway (PR 3).
 *
 * Every presigned PUT and part URL binds Content-Length, so R2 refuses a body of
 * any other size. The bucket is private: no public access, no r2.dev.
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CONTENT_UPLOAD } from "@repo/constants";
import { env } from "../../env";
import { createPresignedPutUrl, verifyUploadedObject, type UploadVerification } from "../s3Upload";

let client: S3Client | null = null;

export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** One client per process. Region "auto" is what R2 expects. */
export function getR2Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: r2Endpoint(env.CF_ACCOUNT_ID),
      // Path style URLs (https://{account}.r2.cloudflarestorage.com/{bucket}/{key}),
      // the form Cloudflare's presigned URL examples use, so one CORS rule covers them
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      // R2 does not support every checksum the SDK picks by default, and a presigned
      // PUT would carry a checksum of an empty body (PR 1, docs/fixes/uploads-sdk-v3-validation.md 3.2)
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

/** Test hook: swap the client for a fake. */
export function setR2ClientForTests(fake: S3Client | null): void {
  client = fake;
}

/** One presigned PUT for a file below the multipart threshold. */
export function presignR2Put(key: string, contentType: string, size: number): Promise<string> {
  return createPresignedPutUrl(getR2Client(), {
    bucket: env.R2_BUCKET,
    key,
    contentType,
    contentLength: size,
    expiresIn: CONTENT_UPLOAD.presignTtlSeconds,
  });
}

export async function createR2Multipart(key: string, contentType: string): Promise<string> {
  const result = await getR2Client().send(
    new CreateMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType })
  );
  if (!result.UploadId) throw new Error("R2 did not return an upload id");
  return result.UploadId;
}

/**
 * Size of part `partNumber` (1 based) of a `totalSize` byte upload. Every part is
 * CONTENT_UPLOAD.partBytes except the last, which holds the remainder.
 */
export function r2PartLength(totalSize: number, partNumber: number): number {
  const start = (partNumber - 1) * CONTENT_UPLOAD.partBytes;
  if (partNumber < 1 || start >= totalSize) {
    throw new Error(`Part ${partNumber} is outside a ${totalSize} byte upload`);
  }
  return Math.min(CONTENT_UPLOAD.partBytes, totalSize - start);
}

/** Presign part URLs, each bound to its exact length. */
export async function presignR2Parts(
  key: string,
  uploadId: string,
  totalSize: number,
  partNumbers: number[]
): Promise<Array<{ partNumber: number; url: string }>> {
  const r2 = getR2Client();
  return Promise.all(
    partNumbers.map(async partNumber => ({
      partNumber,
      url: await getSignedUrl(
        r2,
        new UploadPartCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ContentLength: r2PartLength(totalSize, partNumber),
        }),
        {
          expiresIn: CONTENT_UPLOAD.presignTtlSeconds,
          signableHeaders: new Set(["content-length"]),
        }
      ),
    }))
  );
}

export async function completeR2Multipart(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    })
  );
}

export async function abortR2Multipart(key: string, uploadId: string): Promise<void> {
  await getR2Client().send(
    new AbortMultipartUploadCommand({ Bucket: env.R2_BUCKET, Key: key, UploadId: uploadId })
  );
}

export async function deleteR2Object(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

/** HeadObject size check plus the 4 KB magic byte check (spec 3.5 step 2). */
export function verifyR2Object(
  key: string,
  expectedSize: number | bigint,
  declaredType: string,
  allowedTypes: readonly string[]
): Promise<UploadVerification> {
  return verifyUploadedObject(getR2Client(), {
    bucket: env.R2_BUCKET,
    key,
    expectedSize,
    declaredType,
    allowedTypes,
  });
}
