import type { createFakeDb } from "./fakeMessagingDb";

/**
 * People for the Amped Messages suites. Creator Maya (1) with a
 * published page and a pool; fans Jordan (2) and Sam (3); a second creator Ana (4).
 */
export const MAYA = 1;
export const JORDAN = 2;
export const SAM = 3;
export const ANA = 4;
export const POOL = 70;

type Fake = ReturnType<typeof createFakeDb>;

export function seedPeople(fake: Fake) {
  const user = (id: number, name: string, handle: string) => ({
    id,
    name,
    handle,
    image: null,
    image_file_id: null,
    page_status: "PUBLISHED",
    block: "no",
    email_verified: true,
    created_at: new Date("2026-01-01T00:00:00Z"),
  });
  fake
    .table("user")
    .push(
      user(MAYA, "Maya Lin", "maya"),
      user(JORDAN, "Jordan", "jordan"),
      user(SAM, "Sam", "sam"),
      user(ANA, "Ana", "ana")
    );
  fake.table("userWallet").push({ id: 10, userId: MAYA });
  fake.table("creatorPool").push({ id: POOL, walletId: 10 });
}

export function openMessages(fake: Fake, creatorUserId = MAYA, over: Record<string, unknown> = {}) {
  // M2: "enabled: false" is ruleKind NOBODY; the invite pilot is gone
  const { enabled, ...rest } = over;
  fake.table("messagingSettings").push({
    userId: creatorUserId,
    ruleKind: enabled === false ? "NOBODY" : "ANYONE",
    stakeMin: null,
    dailyNewThreadCap: 50,
    replyFromTelegram: true,
    readReceipts: true,
    pausedAt: null,
    pausedReason: null,
    updatedAt: new Date(),
    ...rest,
  });
}

export function follow(fake: Fake, followerId: number, creatorId: number) {
  fake.table("follow").push({
    id: fake.table("follow").length + 1,
    follower_id: followerId,
    creator_id: creatorId,
    created_at: new Date(),
  });
}
