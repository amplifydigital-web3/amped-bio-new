/**
 * The pay sheet's quote (Build Board #49, PR CK-2; docs/features/mobile-checkout.md 5 and 10).
 *
 * One call gives the sheet everything it shows: what is bought, from whom, in the
 * creator's look, for how much, and whether payment can go ahead. The sheet calls it on
 * every open, so a price or fee that changed shows before Pay.
 *
 * The amount is CHECKOUT_MOCK_PRICE_UNITS, or the site_settings row
 * CHECKOUT_MOCK_PRICE_SETTING when one is set, until offers arrive with store PR 9. The fee,
 * the pause, the pilot list and the daily limits are the real AmpedPay settings. The provider
 * reads ampedpay once PAY-2 is configured in the environment (contract, relayer, split
 * signer); the client sheet switches to it in CK-5.
 *
 * CK-5 adds the store policy (store policy 3.4 and 3.6, mobile checkout 5 and 10): the seller
 * name from the live policy, its version, and whether it changed since this intent was first
 * quoted. The first quote stores the version on the intent.
 */
import { prisma } from "@repo/database";
import {
  AMPEDPAY_CONTRACT,
  CHECKOUT_MOCK_PRICE_SETTING,
  CHECKOUT_MOCK_PRICE_UNITS,
  type AnyThemeConfig,
  type CheckoutProvider,
  type CheckoutQuoteState,
  type ThemeConfig,
} from "@repo/constants";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { liveVersion, versionSummary } from "../store/policy";
import { checkIdentity } from "../identity/checks";
import { checkMerchant } from "../merchants/check";
import { paymentSettings, type PaymentSettings } from "../payments/settings";
import { resolvePromoter } from "../store/promoters";
import { checkoutProvider } from "./provider";
import {
  effectiveStatus,
  hexToIntentId,
  intentIdToHex,
  notFound,
  resolveTarget,
  targetOf,
} from "./intents";

export type CheckoutQuote = {
  id: string;
  status: string;
  state: CheckoutQuoteState;
  provider: CheckoutProvider;
  item: {
    title: string;
    publicId: string;
    kind: string;
    adult: boolean;
    path: string;
    /** Access period in days; null stays in the Library (CK-5 access line) */
    accessPeriodDays: number | null;
  } | null;
  creator: {
    handle: string;
    name: string;
    image: string | null;
    theme: AnyThemeConfig | null;
  } | null;
  /**
   * The live store policy (CK-5): its seller name and version, and `changed` when it is not
   * the version this intent was first quoted with. Null before the creator publishes one.
   */
  policy: { version: number; sellerName: string; changed: boolean } | null;
  /** USDC units as decimal strings (6 decimals), fee included in amount */
  amount: string;
  fee: string;
  feeBps: number;
  quotedAt: string;
  validUntil: string;
  /** C12: "Referred by @handle" when the intent carries an active, in scope promoter code */
  promoter: { handle: string } | null;
  /**
   * AB-2: set for a merchant's service offer. The sheet shows the service variant: seller line
   * with the merchant's policy link, the fee row with its percent, and Start verification.
   */
  service?: { merchantName: string; storePolicyUrl: string | null; code: string | null } | null;
};

/** Statuses that count against the daily purchase limits. */
const COUNTED_STATUSES = ["submitted", "paid"];

/** The creator's page theme, with an uploaded background resolved to a URL. */
async function creatorTheme(themeId: number | null): Promise<AnyThemeConfig | null> {
  const id = Number(themeId);
  if (!themeId || !Number.isInteger(id) || id <= 0) return null;
  const theme = await prisma.theme.findUnique({ where: { id }, select: { config: true } });
  const config = (theme?.config ?? null) as ThemeConfig | null;
  if (config?.background?.fileId) {
    config.background.value = await getFileUrl({
      legacyImageField: null,
      imageFileId: config.background.fileId,
    });
  }
  return config as AnyThemeConfig | null;
}

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The price until offers arrive with store PR 9: the site_settings row
 * CHECKOUT_MOCK_PRICE_SETTING (USDC units, 6 decimals) when it holds a whole positive number,
 * else 3 USDC. Clamped to the one time price bounds. PAY-2 charges this amount through
 * AmpedPay, so the quote and prepare share it.
 */
export async function checkoutAmount(
  settings: Pick<PaymentSettings, "oneTimePriceMin" | "oneTimePriceMax">
): Promise<bigint> {
  const { oneTimePriceMin: min, oneTimePriceMax: max } = settings;
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: CHECKOUT_MOCK_PRICE_SETTING },
  });
  const raw = row?.setting_value.trim();
  const configured = raw && /^[1-9]\d{0,12}$/.test(raw) ? BigInt(raw) : CHECKOUT_MOCK_PRICE_UNITS;
  if (configured < min) return min;
  if (configured > max) return max;
  return configured;
}

/**
 * Verified seller gate (identity checks 5.3, store catalog 1): the creator must hold a
 * seller pass, Authbase verified plus an active RNS name bound to the same wallet the
 * quote pays. This is the hard stop before a sale is quoted, so it runs fresh (spec 5.3):
 * a revoked verification or a lost name stops the next quote, not one up to 24 hours
 * later. checkIdentity never throws and fails closed: any fail reason, including
 * "unavailable" when Authbase is down or not configured, refuses the quote.
 */
async function sellerPasses(creatorUserId: number): Promise<boolean> {
  const result = await checkIdentity(creatorUserId, "seller", { fresh: true });
  return result.pass;
}

type LiveVersion = NonNullable<Awaited<ReturnType<typeof liveVersion>>>;

/**
 * The store policy part of a quote. The first quote that sees a live policy stores its version
 * on the intent; a later live version reads as changed until the fan accepts it in prepare.
 */
async function quotePolicy(
  intent: { id: Uint8Array; storePolicyVersionId: Uint8Array | null },
  live: LiveVersion
) {
  const { sellerName, version } = versionSummary(live);
  let shown = intent.storePolicyVersionId;
  if (!shown) {
    await prisma.checkoutIntent.updateMany({
      where: { id: Buffer.from(intent.id), storePolicyVersionId: null },
      data: { storePolicyVersionId: Buffer.from(live.id) },
    });
    shown = live.id;
  }
  return { version, sellerName, changed: !Buffer.from(shown).equals(Buffer.from(live.id)) };
}

/**
 * The quote for an intent the viewer has claimed. Only that fan can read it: anyone else
 * gets the same not found as an unknown id, so nothing about the purchase leaks.
 */
export async function quoteIntent(viewerUserId: number, idHex: string): Promise<CheckoutQuote> {
  // Safety rail: refuses the mock provider in production and on mainnet, whatever the flags
  const provider = checkoutProvider();
  const row = await prisma.checkoutIntent.findUnique({
    where: { id: hexToIntentId(idHex) },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      creatorUserId: true,
      userId: true,
      status: true,
      expiresAt: true,
      via: true,
      storePolicyVersionId: true,
    },
  });
  if (!row || row.userId !== viewerUserId) throw notFound();

  const now = new Date();
  const status = effectiveStatus(row, now);
  const settings = await paymentSettings(now.getTime());
  const base = {
    id: intentIdToHex(row.id),
    status,
    provider,
    feeBps: settings.platformFeeBps,
    quotedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + settings.quoteWindowSeconds * 1000).toISOString(),
  };

  const resolved = status === "expired" ? null : await resolveTarget(targetOf(row));
  if (!resolved) {
    if (status === "expired") throw notFound();
    return {
      ...base,
      // A paid intent stays paid even if the item was removed since
      state: status === "paid" ? "paid" : "removed",
      item: null,
      creator: null,
      policy: null,
      amount: "0",
      fee: "0",
      promoter: null,
      service: null,
    };
  }

  const [image, theme, wallet, countedToday, live] = await Promise.all([
    getFileUrl({
      legacyImageField: resolved.extra.creatorImage,
      imageFileId: resolved.extra.creatorImageFileId,
    }).catch(() => null),
    creatorTheme(resolved.extra.creatorThemeId).catch(() => null),
    prisma.userWallet.findUnique({
      where: { userId: resolved.creatorUserId },
      select: { address: true },
    }),
    prisma.checkoutIntent.count({
      where: {
        userId: viewerUserId,
        status: { in: COUNTED_STATUSES },
        updatedAt: { gte: startOfUtcDay(now) },
      },
    }),
    // A merchant sells under its own policy URL, not the Owner account's store policy (AB-2)
    resolved.extra.merchantId ? Promise.resolve(null) : liveVersion(resolved.creatorUserId),
  ]);
  const policy = live ? await quotePolicy(row, live) : null;

  // AB-1: a merchant offer runs the business seller gate and carries the merchant's fee
  const merchant = resolved.extra.merchantId
    ? await checkMerchant(Buffer.from(resolved.extra.merchantId, "hex"), { screen: false })
    : null;
  const feeBps = merchant?.pass ? merchant.feeBps : settings.platformFeeBps;

  // A product carries its amount (C9); a content target still uses the checkout amount
  const amount = resolved.extra.amountUnits ?? (await checkoutAmount(settings));
  const fee = (amount * BigInt(feeBps)) / 10_000n;
  const handle = resolved.item.creatorHandle;

  // The same rule prepare applies, without the screening call; prepare has the last word
  // Merchant sales carry no promoter row (spec 3.1)
  const promoter = merchant
    ? null
    : await resolvePromoter({
        via: row.via,
        creatorUserId: resolved.creatorUserId,
        targetId: row.targetType === "offer" ? row.targetId : null,
        buyerUserId: viewerUserId,
        payer: null,
        platformFeeBps: settings.platformFeeBps,
        minCreatorBps: AMPEDPAY_CONTRACT.defaults.minCreatorBps,
        now,
      }).catch(() => null);

  // Order matters: one state per sheet, the most specific cause first
  let state: CheckoutQuoteState = "ready";
  // Paid is terminal: it never reads ready again, so the sheet cannot offer Pay twice
  if (status === "paid") state = "paid";
  else if (settings.paymentsPaused) state = "paused";
  else if (merchant && !merchant.pass) state = "seller";
  else if (
    !merchant &&
    (!wallet || (settings.pilotOnly && !settings.pilotCreators.includes(handle)))
  )
    state = "seller";
  else if (!merchant && !(await sellerPasses(resolved.creatorUserId))) state = "seller";
  // The daily limit applies to every seller, merchant offers included: prepare enforces it too
  else if (countedToday >= settings.purchasesPerDayPerAccount) state = "limit";

  return {
    ...base,
    feeBps,
    state,
    item: {
      title: resolved.item.title,
      publicId: resolved.extra.publicId,
      kind: resolved.extra.kind,
      path: resolved.extra.path,
      accessPeriodDays: resolved.extra.accessPeriodDays,
      // 18+ items are refused at start until A1 opens them (identity checks 4.4), so this
      // is false today; the sheet already sends an 18+ item to the Over 18 check (CK-0 6)
      adult: false,
    },
    creator: { handle, name: resolved.item.creatorName, image, theme },
    policy,
    amount: amount.toString(),
    fee: fee.toString(),
    promoter: promoter ? { handle: promoter.handle } : null,
    service: resolved.extra.merchantId
      ? await serviceInfo(resolved.extra.merchantId, row.targetId)
      : null,
  };
}

/** The merchant's name, policy URL and product code for the service sheet (AB-2). */
async function serviceInfo(merchantIdHex: string, offerIdHex: string) {
  const [merchant, offer] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: Buffer.from(merchantIdHex, "hex") },
      select: { name: true, storePolicyUrl: true },
    }),
    /^[0-9a-f]{32}$/.test(offerIdHex)
      ? prisma.offer.findUnique({
          where: { id: Buffer.from(offerIdHex, "hex") },
          select: { externalCode: true },
        })
      : Promise.resolve(null),
  ]);
  return merchant
    ? {
        merchantName: merchant.name,
        storePolicyUrl: merchant.storePolicyUrl,
        code: offer?.externalCode ?? null,
      }
    : null;
}
