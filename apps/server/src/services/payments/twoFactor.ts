import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { auth } from "../../utils/auth";

/**
 * Two factor at the moment of change (spec 3.5): every payments change, approval and pause
 * asks for a fresh authenticator code, even inside a signed in session. The code is checked
 * by better-auth's own TOTP verify, so the stored secret never leaves the auth library.
 *
 * better-auth applies its lockout only during sign in, so this check keeps its own budget:
 * 5 wrong codes in 15 minutes locks payments changes for that account for 15 minutes.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failures = new Map<number, { count: number; first: number; lockedUntil: number }>();

/** Test seam. */
export function clearTwoFactorFailuresForTests() {
  failures.clear();
}

function locked(userId: number, now: number): boolean {
  const entry = failures.get(userId);
  if (!entry) return false;
  if (entry.lockedUntil > now) return true;
  if (now - entry.first > WINDOW_MS) failures.delete(userId);
  return false;
}

function recordFailure(userId: number, now: number) {
  const entry = failures.get(userId);
  if (!entry || now - entry.first > WINDOW_MS) {
    failures.set(userId, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + WINDOW_MS;
}

export async function assertTwoFactorCode(
  userId: number,
  code: string,
  headers: unknown,
  now = Date.now()
): Promise<void> {
  const enrolled = await prisma.twoFactor.findUnique({
    where: { userId },
    select: { verified: true },
  });
  if (!enrolled || enrolled.verified === false) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Turn on two factor in Account before changing payment settings.",
    });
  }
  if (locked(userId, now)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many wrong codes. Payment changes are locked for 15 minutes.",
    });
  }
  if (!/^\d{6}$/.test(code)) {
    recordFailure(userId, now);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter the 6 digit code from your authenticator app.",
    });
  }

  let valid = false;
  try {
    // With a session, better-auth returns the session token on a match and throws
    // INVALID_CODE otherwise
    const result = (await auth.api.verifyTOTP({
      body: { code },
      headers: headers as Headers,
    })) as { token?: unknown } | undefined;
    valid = typeof result?.token === "string" && result.token.length > 0;
  } catch {
    valid = false;
  }
  if (!valid) {
    recordFailure(userId, now);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That code did not match. Check your authenticator app and try again.",
    });
  }
  failures.delete(userId);
}
