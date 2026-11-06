import { randomUUID } from "node:crypto";
import { getAddress, isAddress, type Address } from "viem";
import { prisma } from "@repo/database";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentClient } from "./chain";

/**
 * Address screening (spec 3.4, decision 3). Circle Compliance Engine first
 * when CIRCLE_API_KEY is set, then the Chainalysis sanctions oracle on Base.
 * A deny from any source refuses the action and writes a ScreeningEvent with
 * the vendor reference. Allows are cached 24 hours per address; denies are
 * never cached. With no vendor configured the result depends on
 * USDC_SCREENING_REQUIRED: refuse (production) or allow as unscreened.
 *
 * Chainalysis marks the free oracle as deprecated for new production
 * integrations, so production should run with Circle; the oracle stays as
 * the second check while it answers.
 */

export type ScreeningVendor = "circle" | "chainalysis_oracle" | "denylist" | "none";

export type ScreeningResult = {
  allowed: boolean;
  /** Vendors that answered, in order */
  checkedBy: ScreeningVendor[];
  /** Set on a deny: the vendor that refused and its reference */
  deniedBy?: ScreeningVendor;
  reference?: string;
  /** True when no vendor was configured and the environment allows that */
  unscreened?: boolean;
};

export type ScreeningContext = "send_destination" | "own_address";

const ALLOW_TTL_MS = 24 * 60 * 60 * 1000;
const allowCache = new Map<string, { result: ScreeningResult; at: number }>();

/** Test seam. */
export function clearScreeningCacheForTests() {
  allowCache.clear();
}

const ORACLE_ABI = [
  {
    type: "function",
    name: "isSanctioned",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function denylist(): Set<string> {
  return new Set(
    env.USDC_SCREEN_DENYLIST.split(",")
      .map(entry => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

type VendorAnswer = { allowed: boolean; reference?: string; detail?: unknown };

async function screenWithCircle(address: Address): Promise<VendorAnswer> {
  const idempotencyKey = randomUUID();
  const response = await fetch("https://api.circle.com/v1/w3s/compliance/screening/addresses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ idempotencyKey, address, chain: env.CIRCLE_SCREENING_CHAIN }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Circle screening returned ${response.status}`);
  }
  const json = (await response.json()) as { data?: CircleScreening } & CircleScreening;
  const body = json.data ?? json;
  const actions = body.decision?.actions ?? [];
  // REVIEW is treated as a deny for a payment: the fan sees the plain line, the admin reviews
  const allowed = body.result === "APPROVED" && !actions.some(a => a === "DENY" || a === "REVIEW");
  return {
    allowed,
    reference: body.alertId ?? body.id ?? idempotencyKey,
    detail: { result: body.result, ruleName: body.decision?.ruleName, actions },
  };
}

type CircleScreening = {
  id?: string;
  result?: "APPROVED" | "DENIED";
  alertId?: string;
  decision?: { ruleName?: string; actions?: string[] };
};

async function screenWithOracle(address: Address): Promise<VendorAnswer> {
  const sanctioned = await paymentClient().readContract({
    address: getAddress(env.CHAINALYSIS_ORACLE),
    abi: ORACLE_ABI,
    functionName: "isSanctioned",
    args: [address],
  });
  return {
    allowed: !sanctioned,
    reference: sanctioned ? `oracle:${env.CHAINALYSIS_ORACLE}` : undefined,
  };
}

async function recordDeny(
  address: Address,
  context: ScreeningContext,
  userId: number | null,
  vendor: ScreeningVendor,
  reference: string | undefined,
  detail: unknown
) {
  try {
    await prisma.screeningEvent.create({
      data: {
        id: uuidv7(),
        userId,
        address,
        context,
        vendor,
        reference: reference?.slice(0, 128) ?? null,
        detail: (detail ?? undefined) as never,
      },
    });
  } catch (error) {
    console.error("[usdc screening] could not record a deny", error);
  }
}

/**
 * Screens one address. Throws ScreeningUnavailableError when a configured
 * vendor cannot answer: the caller refuses the send with the paused line
 * rather than letting an unscreened payment through.
 */
export async function screenAddress(
  raw: string,
  context: ScreeningContext,
  userId: number | null = null,
  now = Date.now()
): Promise<ScreeningResult> {
  if (!isAddress(raw, { strict: false })) {
    return { allowed: false, checkedBy: [], deniedBy: "none", reference: "invalid_address" };
  }
  const address = getAddress(raw);
  const key = address.toLowerCase();

  if (denylist().has(key)) {
    await recordDeny(address, context, userId, "denylist", "denylist", null);
    return { allowed: false, checkedBy: ["denylist"], deniedBy: "denylist", reference: "denylist" };
  }

  const cached = allowCache.get(key);
  if (cached && now - cached.at < ALLOW_TTL_MS) return cached.result;

  const checkedBy: ScreeningVendor[] = [];
  const vendors: Array<[ScreeningVendor, (a: Address) => Promise<VendorAnswer>]> = [];
  if (env.CIRCLE_API_KEY) vendors.push(["circle", screenWithCircle]);
  if (env.CHAINALYSIS_ORACLE) vendors.push(["chainalysis_oracle", screenWithOracle]);

  if (vendors.length === 0) {
    if (env.USDC_SCREENING_REQUIRED)
      throw new ScreeningUnavailableError("No screening vendor configured");
    const result: ScreeningResult = { allowed: true, checkedBy: ["none"], unscreened: true };
    return result;
  }

  for (const [vendor, run] of vendors) {
    let answer: VendorAnswer;
    try {
      answer = await run(address);
    } catch (error) {
      console.error(`[usdc screening] ${vendor} did not answer`, error);
      throw new ScreeningUnavailableError(`${vendor} unavailable`);
    }
    checkedBy.push(vendor);
    if (!answer.allowed) {
      await recordDeny(address, context, userId, vendor, answer.reference, answer.detail);
      return { allowed: false, checkedBy, deniedBy: vendor, reference: answer.reference };
    }
  }

  const result: ScreeningResult = { allowed: true, checkedBy };
  allowCache.set(key, { result, at: now });
  return result;
}

export class ScreeningUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreeningUnavailableError";
  }
}
