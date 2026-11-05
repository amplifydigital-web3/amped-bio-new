/**
 * Store policy (C9; docs/features/store-policy.md 3.1 to 3.7). The creator is the seller of
 * record, so every store carries a policy in the creator's name: the standard template with
 * their fields, or their own text. A publish writes a StorePolicyVersion that is never edited.
 */
import { prisma } from "@repo/database";
import {
  DEFAULT_STORE_POLICY_DRAFT,
  STORE_POLICY_MAX_CHARS,
  STORE_POLICY_PUBLISH_PER_DAY,
  STORE_POLICY_TEMPLATE_VERSION,
  findPolicyLinks,
  refundSummary,
  renderStandardPolicy,
  requiredConfirmations,
  storePolicyDraftSchema,
  storePolicyNotice,
  type StorePolicyDraft,
  type StorePolicyPublic,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { ensureStore } from "./settings";

export class StorePolicyError extends Error {
  constructor(
    readonly code:
      | "policy_seller_name"
      | "policy_too_long"
      | "policy_empty"
      | "policy_external_link"
      | "policy_confirmations_missing"
      | "policy_rate_limited",
    readonly detail: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "StorePolicyError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The stored draft, or the default, always valid against the current schema. */
export function readDraft(raw: unknown): StorePolicyDraft {
  const parsed = storePolicyDraftSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_STORE_POLICY_DRAFT;
}

/** "3 Nov 2026" */
export function policyDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Creator = { id: number; handle: string | null; name: string | null };

async function creatorOf(userId: number): Promise<Creator> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, handle: true, name: true },
  });
  if (!user) throw new Error("creator not found");
  return user;
}

/** The seller name a draft fills in: the display name, or the legal name the creator typed. */
export function sellerNameOf(draft: StorePolicyDraft, creator: Pick<Creator, "name" | "handle">) {
  if (draft.seller.source === "legal") return draft.seller.legalName.trim();
  return (creator.name ?? "").trim() || `@${creator.handle ?? "creator"}`;
}

/** The text a draft publishes as: the filled template, or the creator's own text. */
export function renderDraft(
  draft: StorePolicyDraft,
  creator: Creator,
  storeName: string | null,
  at: Date,
  adult = false
): { sellerName: string; text: string } {
  const sellerName = sellerNameOf(draft, creator);
  if (draft.mode === "custom") return { sellerName, text: draft.custom.text.trim() };
  return {
    sellerName,
    text: renderStandardPolicy({
      sellerName,
      storeName: storeName?.trim() || sellerName,
      handle: creator.handle ?? "",
      refund: draft.standard.refund,
      email: draft.standard.email,
      effectiveDate: policyDate(at),
      adult,
    }),
  };
}

/** Every publish rule the server enforces (store policy 3.1). Throws StorePolicyError. */
export function assertPublishable(draft: StorePolicyDraft, sellerName: string, adult = false) {
  if (!sellerName || sellerName.length > 80) throw new StorePolicyError("policy_seller_name");
  if (draft.mode !== "custom") return;
  const text = draft.custom.text.trim();
  if (!text) throw new StorePolicyError("policy_empty");
  if (text.length > STORE_POLICY_MAX_CHARS) throw new StorePolicyError("policy_too_long");
  const hosts = findPolicyLinks(text);
  if (hosts.length) throw new StorePolicyError("policy_external_link", { host: hosts[0], hosts });
  const ticked = new Set(draft.custom.confirmations);
  const missing = requiredConfirmations(adult).filter(key => !ticked.has(key));
  if (missing.length) throw new StorePolicyError("policy_confirmations_missing", { missing });
}

type VersionRow = {
  id: Uint8Array;
  version: number;
  mode: string;
  settings: unknown;
  renderedText: string;
  publishedAt: Date;
};

type StoredSettings = {
  sellerName: string;
  seller: StorePolicyDraft["seller"];
  refund?: StorePolicyDraft["standard"]["refund"];
  email?: string | null;
};

/** Seller name and refund summary of a published version, for every fan surface. */
export function versionSummary(row: Pick<VersionRow, "mode" | "settings" | "version">) {
  const settings = row.settings as StoredSettings;
  const mode = row.mode === "custom" ? "custom" : "standard";
  return {
    sellerName: settings.sellerName,
    summary: refundSummary(settings.sellerName, { mode, refund: settings.refund }),
    version: row.version,
  };
}

export async function liveVersion(userId: number): Promise<VersionRow | null> {
  const store = await prisma.storeSettings.findUnique({
    where: { userId },
    select: { livePolicyVersionId: true },
  });
  if (!store?.livePolicyVersionId) return null;
  return prisma.storePolicyVersion.findUnique({
    where: { id: Buffer.from(store.livePolicyVersionId) },
  });
}

/** The Policy tab: the draft, the live version and a preview of the draft. */
export async function getPolicy(userId: number, now = new Date()) {
  const store = await ensureStore(userId);
  const creator = await creatorOf(userId);
  const draft = readDraft(store.policyDraft);
  const live = await liveVersion(userId);
  const preview = renderDraft(draft, creator, store.name, now);
  return {
    draft,
    notice: storePolicyNotice(preview.sellerName),
    preview: preview.text,
    live: live
      ? {
          mode: live.mode,
          publishedAt: live.publishedAt.toISOString(),
          ...versionSummary(live),
        }
      : null,
    templateVersion: STORE_POLICY_TEMPLATE_VERSION,
  };
}

export async function saveDraft(userId: number, draft: StorePolicyDraft) {
  await ensureStore(userId);
  await prisma.storeSettings.update({ where: { userId }, data: { policyDraft: draft } });
  return { saved: true };
}

/** The text a draft would publish, with links flagged, without saving. */
export async function previewDraft(userId: number, draft: StorePolicyDraft, now = new Date()) {
  const store = await ensureStore(userId);
  const creator = await creatorOf(userId);
  const rendered = renderDraft(draft, creator, store.name, now);
  return {
    notice: storePolicyNotice(rendered.sellerName),
    text: rendered.text,
    links: draft.mode === "custom" ? findPolicyLinks(draft.custom.text) : [],
  };
}

/** Publishes the saved draft's selected mode as the next version. 10 a day per creator. */
export async function publishPolicy(userId: number, now = new Date()) {
  const store = await ensureStore(userId);
  const creator = await creatorOf(userId);
  const draft = readDraft(store.policyDraft);
  const rendered = renderDraft(draft, creator, store.name, now);
  assertPublishable(draft, rendered.sellerName);

  const since = new Date(now.getTime() - DAY_MS);
  const recent = await prisma.storePolicyVersion.findMany({
    where: { creatorUserId: userId, publishedAt: { gte: since } },
    orderBy: { publishedAt: "asc" },
    select: { publishedAt: true },
  });
  if (recent.length >= STORE_POLICY_PUBLISH_PER_DAY) {
    throw new StorePolicyError("policy_rate_limited", {
      resetAt: new Date(recent[0]!.publishedAt.getTime() + DAY_MS).toISOString(),
    });
  }

  const last = await prisma.storePolicyVersion.findFirst({
    where: { creatorUserId: userId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;
  const id = uuidv7();
  const settings: StoredSettings = {
    sellerName: rendered.sellerName,
    seller: draft.seller,
    ...(draft.mode === "standard"
      ? { refund: draft.standard.refund, email: draft.standard.email }
      : {}),
  };
  await prisma.$transaction([
    prisma.storePolicyVersion.create({
      data: {
        id,
        creatorUserId: userId,
        version,
        mode: draft.mode,
        templateVersion: draft.mode === "standard" ? STORE_POLICY_TEMPLATE_VERSION : null,
        settings,
        confirmations:
          draft.mode === "custom"
            ? { keys: draft.custom.confirmations, at: now.toISOString() }
            : undefined,
        renderedText: rendered.text,
        publishedAt: now,
      },
    }),
    prisma.storeSettings.update({ where: { userId }, data: { livePolicyVersionId: id } }),
  ]);
  return { version, publishedAt: now.toISOString() };
}

/**
 * /{handle}/store/policy (sp4). The current version shows while the store is visible; a past
 * version (?v=) shows to the creator and to anyone the caller vouches for (a buyer on that
 * version, C10). Everyone else gets null.
 */
export async function publicPolicy(
  creator: { id: number; handle: string },
  options: { version?: number; storeVisible: boolean; isOwner: boolean }
): Promise<StorePolicyPublic | null> {
  const live = await liveVersion(creator.id);
  if (!live) return null;
  const wanted = options.version ?? live.version;
  const isCurrent = wanted === live.version;
  if (isCurrent && !options.storeVisible && !options.isOwner) return null;
  if (!isCurrent && !options.isOwner) return null;
  const row = isCurrent
    ? live
    : await prisma.storePolicyVersion.findUnique({
        where: { creatorUserId_version: { creatorUserId: creator.id, version: wanted } },
      });
  if (!row) return null;
  const next = isCurrent
    ? null
    : await prisma.storePolicyVersion.findUnique({
        where: { creatorUserId_version: { creatorUserId: creator.id, version: wanted + 1 } },
        select: { publishedAt: true },
      });
  const { sellerName } = versionSummary(row);
  return {
    handle: creator.handle,
    sellerName,
    notice: storePolicyNotice(sellerName),
    version: row.version,
    mode: row.mode === "custom" ? "custom" : "standard",
    text: row.renderedText,
    publishedAt: row.publishedAt.toISOString(),
    current: isCurrent,
    supersededAt: next ? next.publishedAt.toISOString() : null,
  };
}
