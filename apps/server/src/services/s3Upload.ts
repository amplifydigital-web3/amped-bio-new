/**
 * Upload helpers for S3 compatible storage, on AWS SDK v3 only.
 *
 * Two jobs:
 * 1. Presign a PUT that is bound to the exact Content-Type and Content-Length
 *    the client declared, so storage refuses any other body.
 * 2. Verify an object after the client says it uploaded it: it exists, its
 *    size equals the declared size, and its first bytes are an allowed type.
 *
 * Both take the client as a parameter so they can be tested without network.
 * Background and reasons: docs/fixes/uploads-sdk-v3-validation.md.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { checkFileSignature, FILE_SIGNATURE_BYTES } from "../utils/fileSignature";

/**
 * Headers the presigned PUT must carry exactly. The v3 presigner leaves
 * Content-Type out of the signature by default (v2 signed it), so it is listed
 * here on purpose. Content-Length makes storage reject a body of any other size.
 */
export const SIGNED_UPLOAD_HEADERS = new Set(["content-type", "content-length"]);

export interface PresignPutParams {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number;
}

export async function createPresignedPutUrl(
  client: S3Client,
  { bucket, key, contentType, contentLength, expiresIn }: PresignPutParams
): Promise<string> {
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error(`Invalid upload size: ${contentLength}`);
  }
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(client, command, {
    expiresIn,
    signableHeaders: SIGNED_UPLOAD_HEADERS,
  });
}

/** The one method the verifier needs. S3Client satisfies it. */
export interface S3Sender {
  send(command: HeadObjectCommand | GetObjectCommand): Promise<any>;
}

export interface VerifyUploadParams {
  bucket: string;
  key: string;
  /** Size the client declared when it asked for the upload URL, in bytes. */
  expectedSize: number | bigint | null;
  /** Type the client declared when it asked for the upload URL. */
  declaredType: string | null;
  /** Types this upload flow accepts. */
  allowedTypes: readonly string[];
}

export type UploadVerificationFailure = "missing" | "size_mismatch" | "type_mismatch";

export type UploadVerification =
  | { ok: true; size: number; detectedType: string }
  | {
      ok: false;
      reason: UploadVerificationFailure;
      detail: string;
    };

function isNotFound(error: any): boolean {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

async function readBody(body: any): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  if (typeof body.transformToByteArray === "function") return body.transformToByteArray();
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

export async function verifyUploadedObject(
  client: S3Sender,
  { bucket, key, expectedSize, declaredType, allowedTypes }: VerifyUploadParams
): Promise<UploadVerification> {
  // 1. The object exists and its stored size equals the declared size.
  let contentLength: number;
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    contentLength = Number(head.ContentLength ?? -1);
  } catch (error) {
    if (isNotFound(error)) return { ok: false, reason: "missing", detail: "Object not found" };
    throw error;
  }

  if (expectedSize === null || expectedSize === undefined) {
    return { ok: false, reason: "size_mismatch", detail: "No declared size on the upload record" };
  }
  if (contentLength !== Number(expectedSize)) {
    return {
      ok: false,
      reason: "size_mismatch",
      detail: `Stored ${contentLength} bytes, declared ${Number(expectedSize)}`,
    };
  }

  // 2. The first bytes are an allowed type and match the declared type.
  const object = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${FILE_SIGNATURE_BYTES - 1}`,
    })
  );
  const head = await readBody(object.Body);
  const signature = checkFileSignature(head, declaredType ?? "", allowedTypes);
  if (!signature.ok) {
    return {
      ok: false,
      reason: "type_mismatch",
      detail: `${signature.reason}: declared ${declaredType ?? "none"}, detected ${signature.detectedType ?? "unknown"}`,
    };
  }

  return { ok: true, size: contentLength, detectedType: signature.detectedType };
}
