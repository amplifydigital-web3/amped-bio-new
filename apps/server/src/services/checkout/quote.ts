/**
 * The pay sheet's quote (Build Board #49, PR CK-2; docs/features/mobile-checkout.md 5 and 10).
 *
 * One call gives the sheet everything it shows: what is bought, from whom, in the
 * creator's look, for how much, and whether payment can go ahead. The sheet calls it on
 * every open, so a price or fee that changed shows before Pay.
 *
 * CK-2 runs on the mock provider: the amount is CHECKOUT_MOCK_PRICE_UNITS, or the
 * site_settings row CHECKOUT_MOCK_PRICE_SETTING when one is set (offers arrive with store
 * PR 9), and nothing is charged. The fee, the pause, the pilot list and the
 * daily limits are the real AmpedPay settings, so the error states behave as they will
 * with PAY-2. CK-5 replaces the amount and the provider and changes no screen.
 */
import { prisma } from "@repo/database";
import {
  CHECKOUT_MOCK_PRICE_SETTING,
  CHECKOUT_MOCK_PRICE_UNITS,
  type AnyThemeConfig,
  type CheckoutProvider,
  type CheckoutQuoteState,
  type ThemeConfig,
} from "@repo/constants";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { paymentSettings } from "../payments/settings";
import { effectiveStatus, hexToIntentId, intentIdToHex, notFound, resolveTarget } from "./intents";

export type CheckoutQuote = {
  id: string;
  status: string;
  state: CheckoutQuoteState;
  provider: CheckoutProvider;
  item: { title: string; publicId: string; kind: string; adult: boolean } | null;
  creator: {
    handle: string;
    name: string;
    image: string | null;
    theme: AnyThemeConfig | null;
  } | null;
  /** USDC units as decimal strings (6 decimals), fee included in amount */
  amount: string;
  fee: string;
  feeBps: number;
  quotedAt: string;
  validUntil: string;
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
 * The mock price: the site_settings row CHECKOUT_MOCK_PRICE_SETTING (USDC units, 6 decimals)
 * when it holds a whole positive number, else 3 USDC. Clamped to the one time price bounds.
 */
async function mockAmount(min: bigint, max: bigint): Promise<bigint> {
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
 * The quote for an intent the viewer has claimed. Only that fan can read it: anyone else
 * gets the same not found as an unknown id, so nothing about the purchase leaks.
 */
export async function quoteIntent(viewerUserId: number, idHex: string): Promise<CheckoutQuote> {
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
    },
  });
  if (!row || row.userId !== viewerUserId) throw notFound();

  const now = new Date();
  const status = effectiveStatus(row, now);
  const settings = await paymentSettings(now.getTime());
  const base = {
    id: intentIdToHex(row.id),
    status,
    provider: "mock" as const,
    feeBps: settings.platformFeeBps,
    quotedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + settings.quoteWindowSeconds * 1000).toISOString(),
  };

  const resolved =
    status === "expired" ? null : await resolveTarget({ type: "content", id: row.targetId });
  if (!resolved) {
    if (status === "expired") throw notFound();
    return {
      ...base,
      state: "removed",
      item: null,
      creator: null,
      amount: "0",
      fee: "0",
    };
  }

  const [image, theme, wallet, countedToday] = await Promise.all([
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
  ]);

  const amount = await mockAmount(settings.oneTimePriceMin, settings.oneTimePriceMax);
  const fee = (amount * BigInt(settings.platformFeeBps)) / 10_000n;
  const handle = resolved.item.creatorHandle;

  // Order matters: one state per sheet, the most specific cause first
  let state: CheckoutQuoteState = "ready";
  if (settings.paymentsPaused) state = "paused";
  else if (!wallet || (settings.pilotOnly && !settings.pilotCreators.includes(handle)))
    state = "seller";
  else if (countedToday >= settings.purchasesPerDayPerAccount) state = "limit";

  return {
    ...base,
    state,
    item: {
      title: resolved.item.title,
      publicId: resolved.extra.publicId,
      kind: resolved.extra.kind,
      // 18+ items are refused at start until A1 opens them (identity checks 4.4), so this
      // is false today; the sheet already sends an 18+ item to the Over 18 check (CK-0 6)
      adult: false,
    },
    creator: { handle, name: resolved.item.creatorName, image, theme },
    amount: amount.toString(),
    fee: fee.toString(),
  };
}
