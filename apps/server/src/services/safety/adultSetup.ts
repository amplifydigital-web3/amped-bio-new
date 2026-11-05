/**
 * Creator 18+ setup, people who appear and releases (adult content review 5.1 to 5.3,
 * 6.1 and 7.4; store policy spec 4.0 to 4.3; PR R4).
 *
 * - Setup: Over 18 and seller passes (checkIdentity), the current policy version, a
 *   custodian of records (encrypted). All pass: `enabledAt`. Turning 18+ off makes
 *   every 18+ item a draft and keeps the records.
 * - People: one release per performer per creator. The creator invites by link
 *   (single use, 14 days, only the sha256 of the token is stored); the person passes
 *   Over 18, sets the options, reads the release and signs; the creator countersigns.
 *   Only then is the person Ready.
 * - Withdraw: ends that one release, hides every item it covers and opens a Take It
 *   Down case per item (7.4).
 * - Items: who appears with the release that covers each person and the recording
 *   dates, the AI label and the confirmation; then submit for review.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma, type AppearingPerson } from "@repo/database";
import {
  ADULT_POLICY_VERSION,
  APPEAR_INVITE_DAYS,
  RELEASE_VERSION,
  releaseOptionsSchema,
  type AdultSubmitError,
  type ReleaseOptions,
  type ReleaseStatus,
} from "@repo/constants";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { checkIdentity } from "../identity/checks";
import { hideItems } from "../content/edge";
import { safetyBox } from "./crypto";
import { openCase } from "./cases";
import { logSafetyEvent } from "./events";

export class AdultSetupError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden" | "bad_request" | "conflict",
    message: string
  ) {
    super(message);
    this.name = "AdultSetupError";
  }
}

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// ----------------------------------------------------------------------------
// Setup (5.1)
// ----------------------------------------------------------------------------

export async function getSetup(userId: number) {
  const [profile, age, seller] = await Promise.all([
    prisma.creatorAdultProfile.findUnique({ where: { userId } }),
    checkIdentity(userId, "age_over_18"),
    checkIdentity(userId, "seller"),
  ]);
  const policyCurrent = profile?.policyVersion === ADULT_POLICY_VERSION;
  return {
    enabled: Boolean(profile?.enabledAt && !profile.disabledAt),
    disabledByAmped: Boolean(profile?.disabledAt && profile.disabledBy !== null),
    disabledReason: profile?.disabledBy !== null ? (profile?.disabledReason ?? null) : null,
    over18: age.pass ? { pass: true as const } : { pass: false as const, reason: age.reason },
    seller: seller.pass ? { pass: true as const } : { pass: false as const, reason: seller.reason },
    policy: {
      accepted: profile?.policyVersion ?? null,
      current: ADULT_POLICY_VERSION,
      ok: policyCurrent,
    },
    custodian: { named: Boolean(profile?.custodianName) },
  };
}

async function ensureProfile(userId: number) {
  return (
    (await prisma.creatorAdultProfile.findUnique({ where: { userId } })) ??
    (await prisma.creatorAdultProfile.create({ data: { id: uuidv7(), userId } }))
  );
}

export async function acceptPolicy(userId: number) {
  await ensureProfile(userId);
  await prisma.creatorAdultProfile.update({
    where: { userId },
    data: { policyVersion: ADULT_POLICY_VERSION },
  });
}

export async function setCustodian(userId: number, input: { name: string; address: string }) {
  await ensureProfile(userId);
  await prisma.creatorAdultProfile.update({
    where: { userId },
    data: {
      custodianName: safetyBox.encrypt(input.name),
      custodianAddress: safetyBox.encrypt(input.address),
    },
  });
}

export async function enableAdult(userId: number) {
  const setup = await getSetup(userId);
  if (setup.disabledByAmped) {
    throw new AdultSetupError(
      "forbidden",
      "18+ was turned off by Amped.Bio. Appeal from Adult content."
    );
  }
  const missing = [
    !setup.over18.pass && "over18",
    !setup.seller.pass && "seller",
    !setup.policy.ok && "policy",
    !setup.custodian.named && "custodian",
  ].filter(Boolean);
  if (missing.length) {
    throw new AdultSetupError("bad_request", `Finish every step first: ${missing.join(", ")}.`);
  }
  await prisma.creatorAdultProfile.update({
    where: { userId },
    data: { enabledAt: new Date(), disabledAt: null, disabledBy: null, disabledReason: null },
  });
}

/** The creator turns 18+ off: every 18+ item becomes a draft; records stay. */
export async function disableAdult(userId: number) {
  const profile = await prisma.creatorAdultProfile.findUnique({ where: { userId } });
  if (!profile?.enabledAt) return { unpublished: 0 };
  const result = await prisma.contentItem.updateMany({
    where: { userId, adult: true, publishState: "PUBLISHED" },
    data: { publishState: "DRAFT" },
  });
  await prisma.creatorAdultProfile.update({
    where: { userId },
    data: { disabledAt: new Date(), disabledBy: null, disabledReason: null },
  });
  return { unpublished: result.count };
}

// ----------------------------------------------------------------------------
// People and releases (5.2)
// ----------------------------------------------------------------------------

export function releaseStatus(
  person: Pick<AppearingPerson, "releaseAt" | "creatorSignedAt" | "withdrawnAt" | "releaseVersion">
): ReleaseStatus {
  if (person.withdrawnAt) return "withdrawn";
  if (!person.releaseAt) return "waiting_to_sign";
  if (!person.creatorSignedAt) return "waiting_for_you";
  return "ready";
}

/** Both signatures, not withdrawn, the current release version. */
export function releaseValid(
  person: Pick<AppearingPerson, "releaseAt" | "creatorSignedAt" | "withdrawnAt" | "releaseVersion">
): boolean {
  return releaseStatus(person) === "ready" && person.releaseVersion === RELEASE_VERSION;
}

export async function listPeople(creatorUserId: number) {
  const rows = await prisma.appearingPerson.findMany({
    where: { creatorUserId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(row => ({
    id: hex(row.id),
    displayName: row.displayName,
    status: releaseStatus(row),
    valid: releaseValid(row),
    releaseAt: row.releaseAt,
    creatorSignedAt: row.creatorSignedAt,
    options: row.releaseOptions as ReleaseOptions | null,
    inviteExpires: row.releaseAt ? null : row.inviteExpires,
  }));
}

export async function invitePerson(
  creatorUserId: number,
  displayName: string,
  now: Date = new Date()
) {
  const token = randomBytes(32).toString("base64url");
  const person = await prisma.appearingPerson.create({
    data: {
      id: uuidv7(),
      creatorUserId,
      displayName: displayName.trim().slice(0, 80),
      inviteHash: tokenHash(token),
      inviteExpires: new Date(now.getTime() + APPEAR_INVITE_DAYS * 86_400_000),
    },
  });
  const app = (env.APP_URL || "https://app.amped.bio").replace(/\/$/, "");
  return { id: hex(person.id), link: `${app}/appear/${token}` };
}

async function personByToken(token: string, now: Date) {
  const person = await prisma.appearingPerson.findUnique({
    where: { inviteHash: tokenHash(token) },
  });
  if (!person || person.withdrawnAt)
    throw new AdultSetupError("not_found", "This invite is not valid.");
  if (!person.releaseAt && person.inviteExpires && person.inviteExpires < now) {
    throw new AdultSetupError("conflict", "This invite has expired. Ask for a new one.");
  }
  return person;
}

/** What the invited person sees before signing. */
export async function getInvite(token: string, userId: number, now: Date = new Date()) {
  const person = await personByToken(token, now);
  if (person.personUserId !== null && person.personUserId !== userId) {
    throw new AdultSetupError("forbidden", "This invite was already used by another account.");
  }
  if (person.creatorUserId === userId) {
    throw new AdultSetupError("forbidden", "You can not sign a release for yourself.");
  }
  const creator = await prisma.user.findUnique({
    where: { id: person.creatorUserId },
    select: { name: true, handle: true },
  });
  const age = await checkIdentity(userId, "age_over_18");
  return {
    displayName: person.displayName,
    creator: { name: creator?.name ?? null, handle: creator?.handle ?? null },
    version: RELEASE_VERSION,
    signed: Boolean(person.releaseAt),
    over18: age.pass ? { pass: true as const } : { pass: false as const, reason: age.reason },
  };
}

/** The filled release text and its hash. The template is the creator's document (docs/legal/performer-release.md). */
export function fillRelease(input: {
  creatorName: string;
  legalName: string;
  options: ReleaseOptions;
  signedAt: Date;
}) {
  const o = input.options;
  const lines = [
    `Performer release, version ${RELEASE_VERSION} (docs/legal/performer-release.md)`,
    `Creator: ${input.creatorName}`,
    `Performer: ${input.legalName}`,
    `Where the creator may sell: ${o.surfaces.length ? o.surfaces.join(", ") : "nowhere beyond the item"}`,
    `Other platforms: ${o.otherPlatforms.kind === "none" ? "Nowhere else" : `Also on ${o.otherPlatforms.text}`}`,
    `Face shown: ${o.faceShown ? "Yes" : "No"}`,
    `Tag: ${o.tagAllowed ? "Yes" : "No"}`,
    `Payment: ${
      o.payment.kind === "none"
        ? "No payment"
        : o.payment.kind === "fixed"
          ? `A fixed fee of ${o.payment.amountUsd} USD`
          : `${o.payment.bps / 100} percent of the creator's share`
    }`,
    `Signed: ${input.signedAt.toISOString()}`,
  ];
  const text = lines.join("\n");
  return { text, hash: createHash("sha256").update(text).digest("hex") };
}

export async function signRelease(
  input: { token: string; options: ReleaseOptions; legalName: string },
  userId: number,
  now: Date = new Date()
) {
  const person = await personByToken(input.token, now);
  if (person.releaseAt) throw new AdultSetupError("conflict", "This release is already signed.");
  if (person.creatorUserId === userId) {
    throw new AdultSetupError("forbidden", "You can not sign a release for yourself.");
  }
  if (person.personUserId !== null && person.personUserId !== userId) {
    throw new AdultSetupError("forbidden", "This invite was already used by another account.");
  }
  const options = releaseOptionsSchema.parse(input.options);
  const age = await checkIdentity(userId, "age_over_18", { fresh: true });
  if (!age.pass) {
    throw new AdultSetupError("forbidden", "Pass the Over 18 check with Authbase before you sign.");
  }
  const creator = await prisma.user.findUnique({
    where: { id: person.creatorUserId },
    select: { name: true, handle: true },
  });
  const filled = fillRelease({
    creatorName: creator?.name || `@${creator?.handle ?? "creator"}`,
    legalName: input.legalName,
    options,
    signedAt: now,
  });
  await prisma.appearingPerson.update({
    where: { id: person.id },
    data: {
      personUserId: userId,
      releaseVersion: RELEASE_VERSION,
      releaseName: safetyBox.encrypt(input.legalName),
      releaseOptions: options,
      idGivenConfirmedAt: now,
      releaseAt: now,
      releaseText: filled.text,
      releaseHash: filled.hash,
      // Snapshot of the check at signing: outcome date, never an attribute value
      checkReference: age.tier,
      checkDate: now,
    },
  });
  return { releaseHash: filled.hash };
}

export async function countersign(creatorUserId: number, personId: string, now: Date = new Date()) {
  const person = await prisma.appearingPerson.findUnique({
    where: { id: Buffer.from(personId, "hex") },
  });
  if (!person || person.creatorUserId !== creatorUserId)
    throw new AdultSetupError("not_found", "Not found.");
  if (!person.releaseAt || person.withdrawnAt) {
    throw new AdultSetupError("bad_request", "The person has not signed yet.");
  }
  await prisma.appearingPerson.update({ where: { id: person.id }, data: { creatorSignedAt: now } });
}

/** Removes a person who has not signed. A signed release stays on record. */
export async function removePerson(creatorUserId: number, personId: string) {
  const person = await prisma.appearingPerson.findUnique({
    where: { id: Buffer.from(personId, "hex") },
  });
  if (!person || person.creatorUserId !== creatorUserId)
    throw new AdultSetupError("not_found", "Not found.");
  if (person.releaseAt) {
    throw new AdultSetupError(
      "bad_request",
      "A signed release stays on record. The person can withdraw it."
    );
  }
  await prisma.appearingPerson.delete({ where: { id: person.id } });
}

/** The person's own releases (Account, Appearing in). */
export async function myAppearances(userId: number) {
  const rows = await prisma.appearingPerson.findMany({ where: { personUserId: userId } });
  const creators = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map(row => row.creatorUserId))] } },
    select: { id: true, handle: true, name: true },
  });
  const byId = new Map(creators.map(c => [c.id, c] as const));
  return rows.map(row => ({
    id: hex(row.id),
    creator: byId.get(row.creatorUserId)?.handle ?? null,
    status: releaseStatus(row),
    releaseAt: row.releaseAt,
  }));
}

/** Withdraw consent (5.2 step 6, 7.4): hides every item this release covers and opens a case each. */
export async function withdrawRelease(userId: number, personId: string, now: Date = new Date()) {
  const person = await prisma.appearingPerson.findUnique({
    where: { id: Buffer.from(personId, "hex") },
  });
  if (!person || person.personUserId !== userId)
    throw new AdultSetupError("not_found", "Not found.");
  if (person.withdrawnAt) return { hidden: 0 };
  await prisma.appearingPerson.update({ where: { id: person.id }, data: { withdrawnAt: now } });
  const covered = await prisma.contentItemPerson.findMany({
    where: { releaseId: person.id },
    select: { contentItemId: true },
  });
  const items = covered.length
    ? await prisma.contentItem.findMany({
        where: { id: { in: covered.map(row => Buffer.from(row.contentItemId)) } },
        select: { id: true, publicId: true, userId: true },
      })
    : [];
  if (items.length) {
    await hideItems(
      items.map(item => item.publicId),
      "withdrawn"
    );
    for (const item of items) {
      const opened = await openCase({
        type: "TAKE_IT_DOWN",
        contentItemId: item.id,
        creatorUserId: item.userId,
        actorId: userId,
        source: "consent_withdrawn",
      });
      await logSafetyEvent({
        caseId: opened.case.id,
        actorId: userId,
        action: "consent_withdrawn",
        detail: { person: hex(person.id) },
      });
    }
  }
  return { hidden: items.length };
}

// ----------------------------------------------------------------------------
// Items (5.3, 6.1)
// ----------------------------------------------------------------------------

async function ownedItem(publicId: string, userId: number) {
  const item = await prisma.contentItem.findUnique({ where: { publicId } });
  if (!item || item.userId !== userId || item.status === "DELETED") {
    throw new AdultSetupError("not_found", "This item is not available.");
  }
  return item;
}

/** Who appears, the AI label and the confirmation. Only Ready people can be tagged. */
export async function setItemPeople(
  userId: number,
  input: {
    publicId: string;
    people: Array<{ personId: string; productionDates: string[] }>;
    aiLabel: boolean;
  }
) {
  const item = await ownedItem(input.publicId, userId);
  const ids = input.people.map(p => Buffer.from(p.personId, "hex"));
  const rows = ids.length
    ? await prisma.appearingPerson.findMany({ where: { id: { in: ids }, creatorUserId: userId } })
    : [];
  if (rows.length !== ids.length || rows.some(row => !releaseValid(row))) {
    throw new AdultSetupError("bad_request", "Only Ready people can be tagged.");
  }
  await prisma.$transaction(async tx => {
    await tx.contentItemPerson.deleteMany({ where: { contentItemId: item.id } });
    for (const entry of input.people) {
      const id = Buffer.from(entry.personId, "hex");
      await tx.contentItemPerson.create({
        data: {
          contentItemId: item.id,
          personId: id,
          // One release per performer per creator: the person's row is the release
          releaseId: id,
          productionDates: [...new Set(entry.productionDates)].sort(),
        },
      });
    }
    await tx.contentItem.update({ where: { id: item.id }, data: { aiLabel: input.aiLabel } });
  });
}

/** Everything 5.2 and 5.3 require before an 18+ item goes to review. Exported for tests. */
export async function submitBlocker(
  userId: number,
  publicId: string
): Promise<AdultSubmitError | null> {
  const [profile, item] = await Promise.all([
    prisma.creatorAdultProfile.findUnique({ where: { userId } }),
    ownedItem(publicId, userId),
  ]);
  if (!profile?.enabledAt || profile.disabledAt) return "adult_off";
  if (profile.policyVersion !== ADULT_POLICY_VERSION) return "policy_outdated";
  if (!item.adult) return "not_labeled";
  if (item.aiLabel === null) return "ai_label_missing";
  const tagged = await prisma.contentItemPerson.findMany({ where: { contentItemId: item.id } });
  if (tagged.length) {
    const releases = await prisma.appearingPerson.findMany({
      where: { id: { in: tagged.map(t => Buffer.from(t.releaseId)) } },
    });
    if (releases.length !== tagged.length || releases.some(r => !releaseValid(r)))
      return "release_missing";
    if (
      tagged.some(
        t => !Array.isArray(t.productionDates) || !(t.productionDates as unknown[]).length
      )
    ) {
      return "production_dates_missing";
    }
  }
  return null;
}

/** Submit for review (6.1): held for an 18+ review case; the first one also opens a setup check. */
export async function submitForReview(userId: number, publicId: string, confirmed: boolean) {
  if (!confirmed) return { ok: false as const, error: "confirmation_missing" as const };
  const blocker = await submitBlocker(userId, publicId);
  if (blocker) return { ok: false as const, error: blocker };
  const item = await ownedItem(publicId, userId);
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { moderationState: "HELD", moderationReason: "adult_review" },
  });
  await openCase({
    type: "ADULT_REVIEW",
    contentItemId: item.id,
    creatorUserId: userId,
    actorId: userId,
    source: "submit_for_review",
    note: "Creator confirmed everyone is 18 or older and agreed to filming and sharing.",
  });
  const earlier = await prisma.safetyCase.count({
    where: { creatorUserId: userId, type: "ADULT_SETUP" },
  });
  if (!earlier) {
    await openCase({
      type: "ADULT_SETUP",
      creatorUserId: userId,
      actorId: userId,
      source: "first_submission",
    });
  }
  return { ok: true as const };
}

/** releaseAllowsSurface (content gating hook): every tagged person's release must allow it. */
export async function surfaceAllowed(itemId: Uint8Array, surface: string): Promise<boolean> {
  if (surface === "content") return true;
  const tagged = await prisma.contentItemPerson.findMany({
    where: { contentItemId: Buffer.from(itemId) },
    select: { releaseId: true },
  });
  if (!tagged.length) return true;
  const releases = await prisma.appearingPerson.findMany({
    where: { id: { in: tagged.map(t => Buffer.from(t.releaseId)) } },
    select: { releaseOptions: true, withdrawnAt: true },
  });
  return releases.every(release => {
    if (release.withdrawnAt) return false;
    const options = releaseOptionsSchema.safeParse(release.releaseOptions);
    return options.success && (options.data.surfaces as string[]).includes(surface);
  });
}
