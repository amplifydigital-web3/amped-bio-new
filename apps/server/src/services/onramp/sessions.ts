import { getAddress, type Hex } from "viem";
import { Prisma, prisma } from "@repo/database";
import {
  ONRAMP_FINAL_STATUSES,
  ONRAMP_LIMITS,
  type OnrampMode,
  type OnrampStatus,
} from "@repo/constants";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { enforceRateLimits } from "../../utils/rateLimit";
import { CdpError, type OnrampQuote, type OnrampTransaction } from "../usdc/cdp";
import { paymentChain, paymentClient } from "../usdc/chain";
import { fromCents, toCents, toUsdcUnits } from "./amounts";
import { isOnrampConfigured, onrampApi } from "./coinbase";
import { partnerUserRefFor } from "./refs";
import type { OnrampRegion } from "./region";

/**
 * Buy USDC through Coinbase (Build Board #5), spec 3.5 and 3.7.
 *
 * Coinbase is the point of purchase. Amped.Bio asks Coinbase which ways to pay
 * serve the fan's region, shows Coinbase's quote, hands the fan to Coinbase,
 * and reports arrival. It never quotes a price of its own, never adds a fee,
 * and never credits a balance: the indexer writes the PaymentEvent when the
 * USDC Transfer lands on Base, and the panel shows Arrived only then.
 */

export const PROVIDER = "coinbase";

export class OnrampInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnrampInputError";
  }
}

/** A Coinbase call failed. The message is safe to show; the code goes to the session. */
export class OnrampProviderError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "OnrampProviderError";
  }
}

function providerError(error: unknown): OnrampProviderError {
  if (error instanceof CdpError) {
    if (error.status === 429) {
      return new OnrampProviderError("Coinbase is busy. Try again in a minute.", "rate_limited");
    }
    if (error.status === 400) {
      return new OnrampProviderError(
        "Coinbase could not price this amount. Try another amount.",
        error.errorType.slice(0, 64) || "invalid_request"
      );
    }
    return new OnrampProviderError(
      "Coinbase did not answer. Try again in a moment.",
      `coinbase_${error.status}`
    );
  }
  return new OnrampProviderError("Coinbase did not answer. Try again in a moment.", "unavailable");
}

/* -------------------------------------------------------------------------- */
/* Region and options                                                         */
/* -------------------------------------------------------------------------- */

type Cached<T> = { value: T; at: number };
const HOUR_MS = 60 * 60 * 1000;
let configCache: Cached<
  Awaited<ReturnType<ReturnType<typeof onrampApi>["getOnrampBuyConfig"]>>
> | null = null;
const optionsCache = new Map<
  string,
  Cached<Awaited<ReturnType<ReturnType<typeof onrampApi>["getOnrampBuyOptions"]>>>
>();

/** Test seam. */
export function clearOnrampCachesForTests() {
  configCache = null;
  optionsCache.clear();
  quoteCache.clear();
}

async function buyConfig(now: number) {
  if (configCache && now - configCache.at < HOUR_MS) return configCache.value;
  const value = await onrampApi().getOnrampBuyConfig();
  configCache = { value, at: now };
  return value;
}

async function buyOptions(region: OnrampRegion, now: number) {
  const key = `${region.country}:${region.subdivision ?? ""}`;
  const hit = optionsCache.get(key);
  if (hit && now - hit.at < HOUR_MS) return hit.value;
  const value = await onrampApi().getOnrampBuyOptions(
    region.country,
    region.country === "US" ? (region.subdivision ?? undefined) : undefined
  );
  optionsCache.set(key, { value, at: now });
  return value;
}

/** Payment method ids Coinbase lists for the hosted (Coinbase account) path. */
const ACCOUNT_METHODS = [
  "CARD",
  "ACH_BANK_ACCOUNT",
  "FIAT_WALLET",
  "CRYPTO_ACCOUNT",
  "PAYPAL",
  "RTP",
];

export type PathOption = {
  available: boolean;
  /** Plain reason when Coinbase rules the path out for this region */
  reason: string | null;
  /** Coinbase's limits for one purchase, in cents */
  minCents: number;
  maxCents: number;
};

export type OnrampOptions = {
  /** The region the options are for; null when it could not be told */
  region: OnrampRegion | null;
  /** True when the fan must pick a country or a US state before a quote */
  needsRegion: boolean;
  /** False when Coinbase sells no USDC on Base in the region */
  regionSupported: boolean;
  /** Countries Coinbase serves, with US states, for the region picker */
  countries: { id: string; subdivisions: string[] }[];
  fiatCurrency: string;
  paths: Record<"coinbase_account", PathOption>;
};

function limitsFor(
  options: Awaited<ReturnType<typeof buyOptions>>,
  currency: string,
  methods: string[]
): { minCents: number; maxCents: number } {
  const limits =
    options.payment_currencies
      ?.find(entry => entry.id === currency)
      ?.limits?.filter(limit => methods.includes(limit.id)) ?? [];
  const mins = limits.map(limit => toCents(limit.min)).filter((v): v is number => v !== null);
  const maxes = limits.map(limit => toCents(limit.max)).filter((v): v is number => v !== null);
  return {
    minCents: mins.length ? Math.max(Math.min(...mins), 1) : ONRAMP_LIMITS.minUsd * 100,
    maxCents: maxes.length ? Math.max(...maxes) : ONRAMP_LIMITS.maxUsd * 100,
  };
}

function sellsUsdcOnBase(options: Awaited<ReturnType<typeof buyOptions>>): boolean {
  return (options.purchase_currencies ?? []).some(
    currency =>
      currency.symbol?.toUpperCase() === "USDC" &&
      (currency.networks ?? []).some(network => network.name?.toLowerCase() === "base")
  );
}

/** USD where Coinbase takes it, otherwise the first currency it lists for the region. */
function fiatCurrencyFor(options: Awaited<ReturnType<typeof buyOptions>>): string {
  const ids = (options.payment_currencies ?? []).map(entry => entry.id);
  return ids.includes("USD") || ids.length === 0 ? "USD" : ids[0]!;
}

export async function onrampOptions(
  detected: OnrampRegion | null,
  chosen?: OnrampRegion | null,
  now = Date.now()
): Promise<OnrampOptions> {
  if (!isOnrampConfigured()) throw new OnrampInputError("Buy USDC is not available yet.");
  let config;
  try {
    config = await buyConfig(now);
  } catch (error) {
    throw providerError(error);
  }
  const countries = (config.countries ?? []).map(country => ({
    id: country.id,
    subdivisions: country.subdivisions ?? [],
  }));
  const region = chosen ?? detected;
  const closed: PathOption = {
    available: false,
    reason: null,
    minCents: ONRAMP_LIMITS.minUsd * 100,
    maxCents: ONRAMP_LIMITS.maxUsd * 100,
  };
  const base = { countries, fiatCurrency: "USD", paths: { coinbase_account: closed } };

  if (!region) return { ...base, region: null, needsRegion: true, regionSupported: true };
  const country = countries.find(entry => entry.id === region.country);
  if (!country) return { ...base, region, needsRegion: false, regionSupported: false };
  if (region.country === "US" && !region.subdivision) {
    return { ...base, region, needsRegion: true, regionSupported: true };
  }
  if (
    region.country === "US" &&
    country.subdivisions.length > 0 &&
    !country.subdivisions.includes(region.subdivision ?? "")
  ) {
    return { ...base, region, needsRegion: false, regionSupported: false };
  }

  let options;
  try {
    options = await buyOptions(region, now);
  } catch (error) {
    throw providerError(error);
  }
  if (!sellsUsdcOnBase(options)) {
    return { ...base, region, needsRegion: false, regionSupported: false };
  }
  const fiatCurrency = fiatCurrencyFor(options);
  const methods = (config.countries ?? [])
    .find(entry => entry.id === region.country)
    ?.payment_methods?.map(method => method.id) ?? [ACCOUNT_METHODS[0]!];
  const accountMethods = ACCOUNT_METHODS.filter(method => methods.includes(method));
  const coinbaseAccount: PathOption = {
    available: accountMethods.length > 0,
    reason: accountMethods.length > 0 ? null : "Coinbase offers no way to pay here yet.",
    ...limitsFor(options, fiatCurrency, accountMethods.length ? accountMethods : ACCOUNT_METHODS),
  };
  return {
    countries,
    fiatCurrency,
    region,
    needsRegion: false,
    regionSupported: coinbaseAccount.available,
    paths: { coinbase_account: coinbaseAccount },
  };
}

/* -------------------------------------------------------------------------- */
/* Quote                                                                      */
/* -------------------------------------------------------------------------- */

/** Coinbase's quote in the shape the panel shows (o1 slab). Figures are Coinbase's. */
export type QuoteView = {
  paymentTotal: string;
  paymentSubtotal: string;
  paymentCurrency: string;
  purchaseAmount: string;
  coinbaseFee: string;
  networkFee: string;
  exchangeRate: string;
};

export function quoteView(quote: OnrampQuote): QuoteView {
  const sum = (type: string) =>
    quote.fees
      .filter(fee => fee.type === type)
      .reduce((cents, fee) => cents + (toCents(fee.amount) ?? 0), 0);
  return {
    paymentTotal: quote.paymentTotal,
    paymentSubtotal: quote.paymentSubtotal,
    paymentCurrency: quote.paymentCurrency,
    purchaseAmount: quote.purchaseAmount,
    coinbaseFee: fromCents(sum("FEE_TYPE_EXCHANGE")),
    networkFee: fromCents(sum("FEE_TYPE_NETWORK")),
    exchangeRate: quote.exchangeRate,
  };
}

const QUOTE_TTL_MS = 30_000;
const quoteCache = new Map<string, Cached<OnrampQuote>>();

async function walletAddress(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wallet: { select: { address: true } } },
  });
  if (!user?.wallet?.address) throw new OnrampInputError("Connect your wallet to buy USDC.");
  return getAddress(user.wallet.address);
}

async function assertAmount(
  cents: number,
  region: OnrampRegion,
  mode: OnrampMode,
  now: number
): Promise<OnrampOptions> {
  const options = await onrampOptions(region, region, now);
  if (!options.regionSupported) throw new OnrampInputError("Coinbase does not sell USDC here yet.");
  const path = options.paths[mode as "coinbase_account"];
  if (!path?.available) throw new OnrampInputError("This way to pay is not offered here.");
  if (cents < path.minCents) {
    throw new OnrampInputError(
      `Minimum ${fromCents(path.minCents)} ${options.fiatCurrency} at Coinbase.`
    );
  }
  if (cents > path.maxCents) {
    throw new OnrampInputError(
      `Maximum ${fromCents(path.maxCents)} ${options.fiatCurrency} at Coinbase for one purchase.`
    );
  }
  return options;
}

/**
 * Coinbase's quote for the Coinbase account path: the Session API quote use
 * case (paymentAmount, paymentCurrency, paymentMethod, country, subdivision).
 * The session URL it also returns is thrown away; a fresh one is made on the
 * tap. Cached 30 seconds per fan and amount, which is also the panel refresh.
 */
export async function onrampQuote(
  userId: number,
  input: { cents: number; mode: OnrampMode; region: OnrampRegion },
  now = Date.now()
): Promise<{ quote: QuoteView; refreshedAt: string }> {
  if (!isOnrampConfigured()) throw new OnrampInputError("Buy USDC is not available yet.");
  if (input.mode !== "coinbase_account")
    throw new OnrampInputError("This way to pay is not offered here.");
  const options = await assertAmount(input.cents, input.region, input.mode, now);
  const key = `${userId}:${input.mode}:${input.cents}:${input.region.country}:${input.region.subdivision ?? ""}`;
  const hit = quoteCache.get(key);
  if (hit && now - hit.at < QUOTE_TTL_MS) {
    return { quote: quoteView(hit.value), refreshedAt: new Date(hit.at).toISOString() };
  }
  // Only a real Coinbase request spends the hourly budget: a cached quote is free
  await enforceRateLimits(
    [{ key: `onramp:quote:${userId}`, limit: 60, windowSeconds: 3600 }],
    "Too many price checks. Try again in a few minutes."
  );
  const destinationAddress = await walletAddress(userId);
  let quote: OnrampQuote | undefined;
  try {
    const response = await onrampApi().createOnrampSession({
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      destinationAddress,
      paymentAmount: fromCents(input.cents),
      paymentCurrency: options.fiatCurrency,
      paymentMethod: "CARD",
      country: input.region.country,
      subdivision:
        input.region.country === "US" ? (input.region.subdivision ?? undefined) : undefined,
      partnerUserRef: await partnerUserRefFor(userId),
    });
    quote = response.quote;
  } catch (error) {
    throw providerError(error);
  }
  if (!quote)
    throw new OnrampProviderError("Coinbase did not return a quote. Try again.", "no_quote");
  // Drop expired entries so the map does not grow for the process lifetime
  for (const [cached, entry] of quoteCache) {
    if (now - entry.at >= QUOTE_TTL_MS) quoteCache.delete(cached);
  }
  quoteCache.set(key, { value: quote, at: now });
  return { quote: quoteView(quote), refreshedAt: new Date(now).toISOString() };
}

/** The quote the fan last saw for this amount and region, for the session record. */
function lastQuote(
  userId: number,
  mode: OnrampMode,
  cents: number,
  region: OnrampRegion,
  now: number
) {
  const key = `${userId}:${mode}:${cents}:${region.country}:${region.subdivision ?? ""}`;
  const entry = quoteCache.get(key);
  return entry && now - entry.at < 5 * 60_000 ? entry.value : null;
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

/** In app path only (an Add USDC link elsewhere sends the fan back). */
export function safeReturnTo(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (value.length > 255 || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

export function sessionIdOf(id: Uint8Array): string {
  return Buffer.from(id).toString("hex");
}

function parseSessionId(sessionId: string): Buffer {
  if (!/^[0-9a-f]{32}$/.test(sessionId)) throw new OnrampInputError("Unknown purchase.");
  return Buffer.from(sessionId, "hex");
}

/**
 * Coinbase account path (o4). Makes the single use hosted URL on the tap: USDC
 * on Base to the fan's wallet, the amount preset, and a redirect back to this
 * panel. Every tap of Open Coinbase again makes a new session row and URL.
 */
export async function createCoinbaseSession(
  userId: number,
  input: { cents: number; region: OnrampRegion; returnTo?: string | null; clientIp?: string },
  now = new Date()
): Promise<{ sessionId: string; onrampUrl: string }> {
  if (!isOnrampConfigured()) throw new OnrampInputError("Buy USDC is not available yet.");
  const options = await assertAmount(input.cents, input.region, "coinbase_account", now.getTime());
  const destination = await walletAddress(userId);
  const partnerUserRef = await partnerUserRefFor(userId);
  const quote = lastQuote(userId, "coinbase_account", input.cents, input.region, now.getTime());
  const id = uuidv7();
  const sessionId = sessionIdOf(id);

  await prisma.onrampSession.create({
    data: {
      id,
      userId,
      provider: PROVIDER,
      mode: "coinbase_account",
      partnerUserRef,
      status: "created",
      fiatAmount: input.cents,
      fiatCurrency: options.fiatCurrency,
      usdcAmount: quote ? toUsdcUnits(quote.purchaseAmount) : null,
      quote: quote ? (quote as unknown as Prisma.InputJsonObject) : Prisma.JsonNull,
      destination,
      chainId: paymentChain.id,
      returnTo: safeReturnTo(input.returnTo),
      sandbox: env.ONRAMP_SANDBOX,
    },
  });

  const redirect = new URL("/wallet", env.APP_URL);
  redirect.searchParams.set("fund", "usdc");
  redirect.searchParams.set("session", sessionId);

  try {
    const response = await onrampApi().createOnrampSession({
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      destinationAddress: destination,
      paymentAmount: fromCents(input.cents),
      paymentCurrency: options.fiatCurrency,
      country: input.region.country,
      subdivision:
        input.region.country === "US" ? (input.region.subdivision ?? undefined) : undefined,
      redirectUrl: redirect.toString(),
      clientIp: input.clientIp,
      partnerUserRef,
    });
    return { sessionId, onrampUrl: response.session.onrampUrl };
  } catch (error) {
    const failure = providerError(error);
    await prisma.onrampSession.update({
      where: { id },
      data: { status: "failed", failureCode: failure.code },
    });
    throw failure;
  }
}

type SessionRow = NonNullable<Awaited<ReturnType<typeof prisma.onrampSession.findFirst>>>;

/** One update from Coinbase (webhook or status API), in our words. */
export type OnrampUpdate = {
  ref?: string | null;
  status: OnrampStatus;
  txHash?: string | null;
  usdcAmount?: bigint | null;
  fiatCents?: number | null;
  failureCode?: string | null;
};

const ORDER: Record<OnrampStatus, number> = {
  created: 0,
  pending_verification: 1,
  pending_payment: 2,
  processing: 3,
  canceled: 4,
  expired: 4,
  failed: 5,
  success: 6,
};

/** A final Coinbase result wins over a cancel or expiry on our side; nothing moves backwards. */
export function nextStatus(current: OnrampStatus, incoming: OnrampStatus): OnrampStatus {
  if (current === "success" || current === "failed") return current;
  if (incoming === "success" || incoming === "failed") return incoming;
  if (current === "canceled" || current === "expired") return current;
  return ORDER[incoming] > ORDER[current] ? incoming : current;
}

/** Coinbase's status words, for orders and hosted transactions. */
export function mapCoinbaseStatus(raw: string | null | undefined): OnrampStatus | null {
  switch ((raw ?? "").toUpperCase()) {
    case "ONRAMP_ORDER_STATUS_PENDING_AUTH":
      return "created";
    case "ONRAMP_ORDER_STATUS_PENDING_VERIFICATION":
      return "pending_verification";
    case "ONRAMP_ORDER_STATUS_PENDING_PAYMENT":
      return "pending_payment";
    case "ONRAMP_ORDER_STATUS_PROCESSING":
    case "ONRAMP_TRANSACTION_STATUS_IN_PROGRESS":
    case "ONRAMP_TRANSACTION_STATUS_CREATED":
      return "processing";
    case "ONRAMP_ORDER_STATUS_COMPLETED":
    case "ONRAMP_TRANSACTION_STATUS_SUCCESS":
      return "success";
    case "ONRAMP_ORDER_STATUS_FAILED":
    case "ONRAMP_TRANSACTION_STATUS_FAILED":
      return "failed";
    default:
      return null;
  }
}

/** Labels the indexed USDC Transfer as Received from Coinbase in Activity. */
export async function labelOnrampTransfer(session: {
  id: Uint8Array;
  userId: number;
  chainId: number;
  txHash: string | null;
}) {
  if (!session.txHash) return;
  await prisma.paymentEvent.updateMany({
    where: {
      chainId: session.chainId,
      txHash: { in: [session.txHash, session.txHash.toLowerCase()] },
      payeeUserId: session.userId,
      refType: null,
    },
    data: { refType: "onramp", refId: Buffer.from(session.id) },
  });
}

/** Writes one Coinbase update onto the session. Returns the stored row. */
export async function applyOnrampUpdate(
  row: SessionRow,
  update: OnrampUpdate
): Promise<SessionRow> {
  const status = nextStatus(row.status as OnrampStatus, update.status);
  const data: Prisma.OnrampSessionUpdateInput = {};
  if (status !== row.status) data.status = status;
  if (update.ref && !row.sessionRef) data.sessionRef = update.ref.slice(0, 128);
  if (update.txHash && /^0x[0-9a-fA-F]{64}$/.test(update.txHash) && !row.txHash) {
    data.txHash = update.txHash;
  }
  if (update.usdcAmount && update.usdcAmount > 0n) data.usdcAmount = update.usdcAmount;
  if (update.fiatCents && update.fiatCents > 0) data.fiatAmount = update.fiatCents;
  if (status === "failed" && update.failureCode) data.failureCode = update.failureCode.slice(0, 64);
  if (Object.keys(data).length === 0) return row;
  let stored: SessionRow;
  try {
    stored = await prisma.onrampSession.update({ where: { id: row.id }, data });
  } catch (error) {
    // Another session already holds this Coinbase id: keep the status, drop the ref
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      delete data.sessionRef;
      stored = await prisma.onrampSession.update({ where: { id: row.id }, data });
    } else {
      throw error;
    }
  }
  if (stored.status === "success") await labelOnrampTransfer(stored);
  return stored;
}

/** v1 transaction to an update. */
export function updateFromTransaction(tx: OnrampTransaction): OnrampUpdate | null {
  const status = mapCoinbaseStatus(tx.status);
  if (!status) return null;
  return {
    ref: tx.transaction_id ?? null,
    status,
    txHash: tx.tx_hash || null,
    usdcAmount: toUsdcUnits(tx.purchase_amount),
    fiatCents: toCents(tx.payment_total),
    failureCode: status === "failed" ? "coinbase_failed" : null,
  };
}

const POLL_EVERY_MS = 15_000;
const FIRST_POLL_AFTER_MS = 20_000;

/**
 * Coinbase account path: reads the Transaction Status API by partnerUserRef
 * and claims the oldest Coinbase transaction made after this session started
 * that no other session holds. At most once every 15 seconds per session.
 */
async function refreshFromCoinbase(row: SessionRow, now: Date): Promise<SessionRow> {
  if (row.mode !== "coinbase_account") return row;
  if (now.getTime() - row.createdAt.getTime() < FIRST_POLL_AFTER_MS) return row;
  if (row.checkedAt && now.getTime() - row.checkedAt.getTime() < POLL_EVERY_MS) return row;
  await prisma.onrampSession.update({ where: { id: row.id }, data: { checkedAt: now } });

  let transactions: OnrampTransaction[];
  try {
    transactions =
      (await onrampApi().getOnrampTransactions(row.partnerUserRef, 10)).transactions ?? [];
  } catch (error) {
    console.warn("[onramp] transaction status did not load", error);
    return row;
  }
  let pick: OnrampTransaction | undefined;
  if (row.sessionRef) {
    pick = transactions.find(tx => tx.transaction_id === row.sessionRef);
  } else {
    const ids = transactions.map(tx => tx.transaction_id).filter((id): id is string => !!id);
    const claimed = new Set(
      (
        await prisma.onrampSession.findMany({
          where: { provider: PROVIDER, sessionRef: { in: ids } },
          select: { sessionRef: true },
        })
      ).map(session => session.sessionRef)
    );
    const since = row.createdAt.getTime() - 60_000;
    const destination = row.destination.toLowerCase();
    pick = transactions
      .filter(tx => tx.transaction_id && !claimed.has(tx.transaction_id))
      .filter(tx => !tx.created_at || Date.parse(tx.created_at) >= since)
      .filter(tx => !tx.wallet_address || tx.wallet_address.toLowerCase() === destination)
      .at(-1);
  }
  const update = pick ? updateFromTransaction(pick) : null;
  return update ? applyOnrampUpdate(row, update) : row;
}

/** True once the USDC is on chain in the fan's wallet (o5 shows only then). */
export async function hasArrived(row: SessionRow): Promise<boolean> {
  if (row.status !== "success") return false;
  // Coinbase's sandbox delivers nothing on chain; on staging the webhook drives arrival
  if (row.sandbox) return true;
  if (!row.txHash) return false;
  const indexed = await prisma.paymentEvent.findFirst({
    where: {
      chainId: row.chainId,
      txHash: { in: [row.txHash, row.txHash.toLowerCase()] },
      payeeUserId: row.userId,
    },
    select: { id: true },
  });
  if (indexed) return true;
  try {
    const receipt = await paymentClient().getTransactionReceipt({ hash: row.txHash as Hex });
    return receipt.status === "success";
  } catch {
    return false;
  }
}

export type SessionView = {
  sessionId: string;
  mode: OnrampMode;
  status: OnrampStatus;
  chainConfirmed: boolean;
  sandbox: boolean;
  fiatAmount: string | null;
  fiatCurrency: string;
  usdcAmount: string | null;
  quote: QuoteView | null;
  txHash: string | null;
  orderRef: string | null;
  failureCode: string | null;
  returnTo: string | null;
  createdAt: string;
};

function view(row: SessionRow, chainConfirmed: boolean): SessionView {
  const quote = row.quote as OnrampQuote | null;
  return {
    sessionId: sessionIdOf(row.id),
    mode: row.mode as OnrampMode,
    status: row.status as OnrampStatus,
    chainConfirmed,
    sandbox: row.sandbox,
    fiatAmount: row.fiatAmount === null ? null : fromCents(row.fiatAmount),
    fiatCurrency: row.fiatCurrency,
    usdcAmount: row.usdcAmount?.toString() ?? null,
    quote: quote && Array.isArray(quote.fees) ? quoteView(quote) : null,
    txHash: row.txHash,
    orderRef: row.sessionRef,
    failureCode: row.failureCode,
    returnTo: row.returnTo,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function onrampStatus(userId: number, sessionId: string, now = new Date()) {
  let row = await prisma.onrampSession.findFirst({
    where: { id: parseSessionId(sessionId), userId },
  });
  if (!row) throw new OnrampInputError("Unknown purchase.");
  const status = row.status as OnrampStatus;
  if (!ONRAMP_FINAL_STATUSES.includes(status) && isOnrampConfigured()) {
    row = await refreshFromCoinbase(row, now);
  }
  const ttl = ONRAMP_LIMITS.sessionTtlMinutes * 60_000;
  if (
    (row.status === "created" ||
      row.status === "pending_verification" ||
      row.status === "pending_payment") &&
    now.getTime() - row.createdAt.getTime() > ttl
  ) {
    row = await prisma.onrampSession.update({ where: { id: row.id }, data: { status: "expired" } });
  }
  return view(row, await hasArrived(row));
}

/**
 * Marks an open session canceled. Nothing is sent to Coinbase; a purchase
 * Coinbase completes after a cancel is still recorded and the USDC still arrives.
 */
export async function cancelOnrampSession(userId: number, sessionId: string) {
  const id = parseSessionId(sessionId);
  await prisma.onrampSession.updateMany({
    where: {
      id,
      userId,
      status: { in: ["created", "pending_verification", "pending_payment"] },
    },
    data: { status: "canceled" },
  });
  const row = await prisma.onrampSession.findFirst({ where: { id, userId } });
  if (!row) throw new OnrampInputError("Unknown purchase.");
  return view(row, await hasArrived(row));
}
