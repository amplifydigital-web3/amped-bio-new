import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@repo/database";
import { uuidv7 } from "../../utils/uuid-v7";
import { env } from "../../env";
import { recordMerchantAudit } from "../merchants/audit";

/**
 * Partner API keys (Build Board #66, AB-4; partner spec 9). A key is shown once, when it is
 * made; only its sha256 is stored. Test keys (ab_test_) work only off production; live keys
 * (ab_live_) only in production. Each key belongs to one merchant.
 */

export class ApiKeyError extends Error {}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function isProduction() {
  return env.APP_ENV === "production";
}

export async function createApiKey(input: {
  merchantId: Buffer;
  actorId: number;
  name: string;
  mode: "test" | "live";
}) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new ApiKeyError("Name the key.");
  if (input.mode === "live" && !isProduction()) {
    throw new ApiKeyError("Live keys are made in production only.");
  }
  if (input.mode === "test" && isProduction()) {
    throw new ApiKeyError("Test keys are made on staging only.");
  }
  const key = `ab_${input.mode}_${randomBytes(24).toString("hex")}`;
  const id = uuidv7();
  await prisma.merchantApiKey.create({
    data: {
      id,
      merchantId: input.merchantId,
      name,
      mode: input.mode,
      prefix: key.slice(0, 16),
      keyHash: hashKey(key),
      createdById: input.actorId,
    },
  });
  await recordMerchantAudit(input.merchantId, input.actorId, "api_key.created", {
    name,
    mode: input.mode,
    prefix: key.slice(0, 16),
  });
  return { id: id.toString("hex"), key };
}

export async function revokeApiKey(merchantId: Buffer, keyId: Buffer, actorId: number) {
  const updated = await prisma.merchantApiKey.updateMany({
    where: { id: keyId, merchantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count !== 1) throw new ApiKeyError("Key not found.");
  await recordMerchantAudit(merchantId, actorId, "api_key.revoked", { id: keyId.toString("hex") });
}

export async function listApiKeys(merchantId: Buffer) {
  const rows = await prisma.merchantApiKey.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(k => ({
    id: Buffer.from(k.id).toString("hex"),
    name: k.name,
    mode: k.mode,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));
}

/** The merchant a bearer key belongs to, or null. Updates last used at most once a minute. */
export async function authenticateKey(header: string | undefined, now = new Date()) {
  const match = /^Bearer\s+(ab_(test|live)_[0-9a-f]{48})$/.exec(header ?? "");
  if (!match) return null;
  const mode = match[2]!;
  if ((mode === "live") !== isProduction()) return null;
  const row = await prisma.merchantApiKey.findUnique({ where: { keyHash: hashKey(match[1]!) } });
  if (!row || row.revokedAt) return null;
  const merchant = await prisma.merchant.findUnique({
    where: { id: row.merchantId },
    select: { id: true, status: true },
  });
  if (!merchant || merchant.status === "suspended") return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.merchantApiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return { merchantId: Buffer.from(row.merchantId), keyId: Buffer.from(row.id) };
}
