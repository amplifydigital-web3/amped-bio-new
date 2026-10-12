import { describe, expect, it } from "vitest";
import { EMAIL_VERIFICATION_GRACE_DAYS } from "@repo/constants";
import {
  hasEmailTrust,
  trustedEmailWhere,
  verificationGate,
  verificationGraceCutoff,
} from "../utils/verificationGrace";

const now = new Date("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe("verification grace", () => {
  it("trusts a verified email at any age", () => {
    expect(hasEmailTrust({ email_verified: true, created_at: daysAgo(400) }, now)).toBe(true);
    expect(verificationGate({ email_verified: true, created_at: daysAgo(400) }, { now })).toEqual({
      verified: true,
      required: false,
      reason: null,
      graceEndsAt: null,
    });
  });

  it("trusts an unverified account inside the grace period", () => {
    const user = { email_verified: false, created_at: daysAgo(EMAIL_VERIFICATION_GRACE_DAYS - 1) };
    expect(hasEmailTrust(user, now)).toBe(true);
    const gate = verificationGate(user, { now });
    expect(gate.required).toBe(false);
    expect(gate.reason).toBeNull();
    expect(gate.graceEndsAt).toBe(
      new Date(user.created_at.getTime() + EMAIL_VERIFICATION_GRACE_DAYS * 86_400_000).toISOString()
    );
  });

  it("requires verification once the grace period has passed", () => {
    const user = { email_verified: false, created_at: daysAgo(EMAIL_VERIFICATION_GRACE_DAYS) };
    expect(hasEmailTrust(user, now)).toBe(false);
    expect(verificationGate(user, { now })).toMatchObject({ required: true, reason: "expired" });
  });

  it("requires verification early when the feature milestone is reached", () => {
    const user = { email_verified: false, created_at: daysAgo(2) };
    expect(verificationGate(user, { now, milestoneReached: true })).toMatchObject({
      required: true,
      reason: "milestone",
    });
    // The milestone changes nothing for a verified account
    expect(
      verificationGate({ ...user, email_verified: true }, { now, milestoneReached: true }).required
    ).toBe(false);
  });

  it("builds the same rule as a Prisma filter", () => {
    expect(trustedEmailWhere(now)).toEqual({
      OR: [{ email_verified: true }, { created_at: { gt: verificationGraceCutoff(now) } }],
    });
    expect(verificationGraceCutoff(now)).toEqual(daysAgo(EMAIL_VERIFICATION_GRACE_DAYS));
  });
});
