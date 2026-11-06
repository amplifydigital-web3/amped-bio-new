/**
 * Child safety evidence (adult content review 8.5, content system 3.11; content PR 7,
 * R1 service). Run by Escalate (R2) and by a CSAM match.
 *
 * `preserveEvidence(caseId, publicId)` copies every object the item has in the
 * content bucket (incoming, originals, quarantine, audio and derived prefixes) to
 * the evidence bucket under `cases/{number}/`, with a JSON manifest: sha256, size,
 * upload time, uploader user id, the IPs held for that account and the report text.
 * The evidence bucket has its own R2 token and a 1 year bucket lock (REPORT Act
 * 2024); no URL or token for it ever leaves the server.
 *
 * It writes SafetyEvent `evidence_preserved` with the object keys and
 * `preservedUntil`, never a URL. A video's Stream copy is recorded by uid: C7a must
 * not delete the Stream video while `streamPending` is true (R2 retries it).
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { prisma } from "@repo/database";
import { CONTENT_R2_PREFIXES } from "@repo/constants";
import { env } from "../../env";
import { getR2Client, r2Endpoint } from "../cloudflare/r2";
import { logSafetyEvent } from "./events";

/** Bucket lock retention (REPORT Act 2024). */
export const EVIDENCE_RETENTION_DAYS = 365;

let evidenceClient: S3Client | null = null;

export function evidenceConfigured(): boolean {
  return Boolean(
    env.CF_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.EVIDENCE_R2_ACCESS_KEY_ID &&
      env.EVIDENCE_R2_SECRET_ACCESS_KEY &&
      env.EVIDENCE_R2_BUCKET
  );
}

function getEvidenceClient(): S3Client {
  if (!evidenceClient) {
    evidenceClient = new S3Client({
      region: "auto",
      endpoint: r2Endpoint(env.CF_ACCOUNT_ID),
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.EVIDENCE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.EVIDENCE_R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return evidenceClient;
}

/** Test hook. */
export function setEvidenceClientForTests(fake: S3Client | null): void {
  evidenceClient = fake;
}

/** The content bucket prefixes an item can have objects under. Exported for tests. */
export function evidencePrefixes(publicId: string): string[] {
  return Object.values(CONTENT_R2_PREFIXES).map(prefix => `${prefix}/${publicId}/`);
}

export type EvidenceResult =
  | { ok: true; keys: string[]; manifestKey: string; preservedUntil: Date; streamPending: boolean }
  | { ok: false; reason: "not_configured" | "not_found" | "copy_failed"; error?: string };

async function listKeys(prefix: string): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = [];
  let token: string | undefined;
  do {
    const page = await getR2Client().send(
      new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) out.push({ key: object.Key, size: Number(object.Size ?? 0) });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function copyObject(sourceKey: string, targetKey: string): Promise<void> {
  const source = await getR2Client().send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: sourceKey })
  );
  if (!source.Body) throw new Error(`empty body for ${sourceKey}`);
  await getEvidenceClient().send(
    new PutObjectCommand({
      Bucket: env.EVIDENCE_R2_BUCKET,
      Key: targetKey,
      Body: source.Body as never,
      ContentLength: source.ContentLength,
      ContentType: source.ContentType ?? "application/octet-stream",
    })
  );
}

export async function preserveEvidence(
  caseId: Uint8Array,
  publicId: string,
  options: { reportText?: string | null; actorId?: number | null; now?: Date } = {}
): Promise<EvidenceResult> {
  const now = options.now ?? new Date();
  const safetyCase = await prisma.safetyCase.findUnique({
    where: { id: Buffer.from(caseId) },
    select: { id: true, number: true },
  });
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      userId: true,
      kind: true,
      sha256: true,
      totalBytes: true,
      createdAt: true,
    },
  });
  if (!safetyCase || !item) return { ok: false, reason: "not_found" };
  if (!evidenceConfigured()) {
    console.error("[safety] ALERT evidence bucket not configured", { case: safetyCase.number });
    await logSafetyEvent({
      caseId,
      actorId: options.actorId ?? null,
      action: "evidence_failed",
      detail: { reason: "not_configured" },
    });
    return { ok: false, reason: "not_configured" };
  }

  const base = `cases/${safetyCase.number}/${item.publicId}`;
  try {
    const objects = (await Promise.all(evidencePrefixes(item.publicId).map(listKeys))).flat();
    const keys: string[] = [];
    for (const object of objects) {
      const target = `${base}/${object.key}`;
      await copyObject(object.key, target);
      keys.push(target);
    }
    const stream = await prisma.contentAsset.findFirst({
      where: { contentItemId: item.id, role: "STREAM" },
      select: { streamUid: true },
    });
    const sessions = await prisma.session.findMany({
      where: { userId: item.userId },
      select: { ipAddress: true },
    });
    const ips = [...new Set(sessions.map(row => row.ipAddress).filter(Boolean))];
    const preservedUntil = new Date(now.getTime() + EVIDENCE_RETENTION_DAYS * 86_400_000);
    const manifest = {
      case: safetyCase.number,
      publicId: item.publicId,
      kind: item.kind,
      sha256: item.sha256,
      size: Number(item.totalBytes),
      uploadedAt: item.createdAt.toISOString(),
      uploaderUserId: item.userId,
      ips,
      reportText: options.reportText ?? null,
      objects: objects.map(object => ({ key: object.key, size: object.size })),
      streamUid: stream?.streamUid ?? null,
      preservedAt: now.toISOString(),
      preservedUntil: preservedUntil.toISOString(),
    };
    const manifestKey = `${base}/manifest.json`;
    await getEvidenceClient().send(
      new PutObjectCommand({
        Bucket: env.EVIDENCE_R2_BUCKET,
        Key: manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      })
    );
    const streamPending = Boolean(stream?.streamUid);
    await logSafetyEvent({
      caseId,
      actorId: options.actorId ?? null,
      action: "evidence_preserved",
      detail: {
        keys: [...keys, manifestKey],
        preservedUntil: preservedUntil.toISOString(),
        streamPending,
      },
    });
    return { ok: true, keys, manifestKey, preservedUntil, streamPending };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[safety] ALERT evidence copy failed", { case: safetyCase.number, message });
    await logSafetyEvent({
      caseId,
      actorId: options.actorId ?? null,
      action: "evidence_failed",
      detail: { reason: "copy_failed" },
    });
    return { ok: false, reason: "copy_failed", error: message };
  }
}
