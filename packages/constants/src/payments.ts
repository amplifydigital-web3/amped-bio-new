/**
 * AmpedPay admin controls (Build Board #50, spec docs/features/ampedpay.md 3.3 to 3.9).
 *
 * One catalog for every payments value: where it lives (Server, On chain, Fixed),
 * its default, how it is stored and how it reads. The server validates against it
 * and the admin pages render from it, so a range or a label is defined once.
 *
 * Stored encodings (site_settings.setting_value and admin_changes old and new values):
 *   bool        "true" or "false"
 *   bps         integer basis points, "500" is 5.00%
 *   int         integer in the unit named by the item
 *   usdc        integer micro USDC (6 decimals), "500000" is 0.50 USDC
 *   usdc_range  "min,max" in micro USDC
 *   bps_range   "min,max" in basis points
 *   eth         decimal ETH with at most 6 places, "0.05"
 *   handles     comma separated lowercase handles
 *   address     0x address (contract values only)
 */

export const PAYMENTS_ADMIN_ROLE = "payments_admin";

export type PaymentValueKind =
  | "bool"
  | "bps"
  | "int"
  | "usdc"
  | "usdc_range"
  | "bps_range"
  | "eth"
  | "handles"
  | "address";

export type PaymentTarget = "server" | "contract" | "fixed";

export type PaymentGroup = "fees" | "limits" | "checkout" | "promoters" | "relayer" | "status";

export const PAYMENT_GROUP_LABELS: Record<PaymentGroup, string> = {
  fees: "Fees and split",
  limits: "Limits",
  checkout: "Checkout",
  promoters: "Promoters and refunds",
  relayer: "Relayer, signer and pilot",
  status: "Status",
};

export const PAYMENT_GROUP_ORDER: PaymentGroup[] = [
  "fees",
  "limits",
  "checkout",
  "promoters",
  "relayer",
];

/** Contract constants and deploy defaults (spec 3.2). PAY-A2 reads the live values from Base. */
export const AMPEDPAY_CONTRACT = {
  BPS: 10_000,
  MAX_FEE_BPS: 1_000,
  MIN_CREATOR_BPS_FLOOR: 5_000,
  MIN_RECIPIENTS: 2,
  MAX_RECIPIENTS_CAP: 8,
  MIN_SPLIT_VALIDITY: 60,
  MAX_SPLIT_VALIDITY_CAP: 86_400,
  MIN_PAYMENT_FLOOR: 10_000n,
  MAX_PAYMENT_CAP: 100_000_000_000n,
  defaults: {
    feeFloorBps: 500,
    minCreatorBps: 5_000,
    maxRecipients: 6,
    maxSplitValidity: 3_600,
    minPayment: 500_000n,
    maxPayment: 1_000_000_000n,
  },
} as const;

export interface PaymentItem {
  /** Item id. For server items it is also the site_settings key, except ranges (see keys). */
  id: string;
  label: string;
  hint?: string;
  group: PaymentGroup;
  target: PaymentTarget;
  kind: PaymentValueKind;
  /** Unit word for int items: "seconds", "blocks", "days", "payments" */
  unit?: string;
  /** site_settings keys the item writes. Ranges write two keys; others write their id. */
  keys: string[];
  /** Default in the stored encoding. Null when it comes from the environment or the deploy. */
  defaultValue: string | null;
  /** Plain words for the allowed range, shown on Settings (spec 3.3, 3.2) */
  allowed: string;
  /** A fee change may carry an effective date (decision 4) */
  effectiveDate?: boolean;
  /** Shown on Settings but not changed through the change sheet */
  hidden?: boolean;
}

const server = (item: Omit<PaymentItem, "target" | "keys"> & { keys?: string[] }): PaymentItem => ({
  target: "server",
  keys: item.keys ?? [item.id],
  ...item,
});

const contract = (item: Omit<PaymentItem, "target" | "keys">): PaymentItem => ({
  target: "contract",
  keys: [],
  ...item,
});

export const PAYMENT_ITEMS: PaymentItem[] = [
  // Status (a1 only)
  server({
    id: "payments_paused",
    label: "Pause payments",
    hint: "Stops new quotes and submits on the server",
    group: "status",
    kind: "bool",
    defaultValue: "false",
    allowed: "On or off",
    hidden: true,
  }),

  // Fees and split
  server({
    id: "platform_fee_bps",
    label: "Platform fee",
    hint: "Amped.Bio share of each payment",
    group: "fees",
    kind: "bps",
    defaultValue: "500",
    allowed: "Fee floor to 10.00%",
    effectiveDate: true,
  }),
  contract({
    id: "feeFloorBps",
    label: "Fee floor",
    hint: "The contract refuses a lower platform share",
    group: "fees",
    kind: "bps",
    defaultValue: String(AMPEDPAY_CONTRACT.defaults.feeFloorBps),
    allowed: "0.00% to 10.00%",
  }),
  {
    id: "MAX_FEE_BPS",
    label: "Fee ceiling",
    group: "fees",
    target: "fixed",
    kind: "bps",
    keys: [],
    defaultValue: String(AMPEDPAY_CONTRACT.MAX_FEE_BPS),
    allowed: "Fixed",
  },
  contract({
    id: "minCreatorBps",
    label: "Creator minimum",
    hint: "Lowest share the creator can receive",
    group: "fees",
    kind: "bps",
    defaultValue: String(AMPEDPAY_CONTRACT.defaults.minCreatorBps),
    allowed: "50.00% to 100.00%",
  }),
  contract({
    id: "maxRecipients",
    label: "Recipients per payment",
    hint: "Creator, platform, promoter and partners",
    group: "fees",
    kind: "int",
    unit: "recipients",
    defaultValue: String(AMPEDPAY_CONTRACT.defaults.maxRecipients),
    allowed: "2 to 8",
  }),
  contract({
    id: "treasury",
    label: "Treasury",
    hint: "Receives the platform share",
    group: "fees",
    kind: "address",
    defaultValue: null,
    allowed: "Any address",
  }),

  // Limits
  contract({
    id: "minPayment",
    label: "Contract minimum per payment",
    group: "limits",
    kind: "usdc",
    defaultValue: AMPEDPAY_CONTRACT.defaults.minPayment.toString(),
    allowed: "0.01 USDC to the maximum",
  }),
  contract({
    id: "maxPayment",
    label: "Contract maximum per payment",
    group: "limits",
    kind: "usdc",
    defaultValue: AMPEDPAY_CONTRACT.defaults.maxPayment.toString(),
    allowed: "The minimum to 100,000.00 USDC",
  }),
  server({
    id: "one_time_price",
    label: "One time price range",
    hint: "What creators can charge",
    group: "limits",
    kind: "usdc_range",
    keys: ["one_time_price_min", "one_time_price_max"],
    defaultValue: "500000,1000000000",
    allowed: "Inside the contract limits",
  }),
  server({
    id: "purchases_per_day_per_account",
    label: "Payments per account per day",
    group: "limits",
    kind: "int",
    unit: "payments",
    defaultValue: "20",
    allowed: "1 to 500",
  }),
  server({
    id: "purchase_usdc_per_day_per_account",
    label: "USDC per account per day",
    group: "limits",
    kind: "usdc",
    defaultValue: "2000000000",
    allowed: "1.00 USDC to 20 times the contract maximum",
  }),

  // Checkout
  server({
    id: "quote_window_seconds",
    label: "Quote window",
    hint: "How long a fan has to sign",
    group: "checkout",
    kind: "int",
    unit: "seconds",
    defaultValue: "600",
    allowed: "1 minute to the split limit",
  }),
  contract({
    id: "maxSplitValidity",
    label: "Split limit",
    hint: "Longest a signed split stays valid",
    group: "checkout",
    kind: "int",
    unit: "seconds",
    defaultValue: String(AMPEDPAY_CONTRACT.defaults.maxSplitValidity),
    allowed: "1 minute to 24 hours",
  }),
  server({
    id: "soft_unlock_confirmations",
    label: "Unlock after",
    hint: "Blocks before the fan can open the item",
    group: "checkout",
    kind: "int",
    unit: "blocks",
    defaultValue: "1",
    allowed: "1 to 12",
  }),
  server({
    id: "final_confirmations",
    label: "Final after",
    hint: "Blocks before the receipt is final",
    group: "checkout",
    kind: "int",
    unit: "blocks",
    defaultValue: "12",
    allowed: "Unlock after to 64",
  }),

  // Promoters and refunds
  server({
    id: "promoter_share",
    label: "Promoter share",
    group: "promoters",
    kind: "bps_range",
    keys: ["promoter_share_min", "promoter_share_max"],
    defaultValue: "100,3000",
    allowed: "0% to 50%, creator stays at the minimum",
  }),
  server({
    id: "promoter_refund_pause_rate",
    label: "Pause a promoter code at",
    hint: "Refund rate over 30 days",
    group: "promoters",
    kind: "bps",
    defaultValue: "1000",
    allowed: "1% to 50%",
  }),
  server({
    id: "refund_window_days",
    label: "Refund window",
    hint: "Days a creator can refund a sale",
    group: "promoters",
    kind: "int",
    unit: "days",
    defaultValue: "30",
    allowed: "0 to 365",
  }),

  // Relayer, signer and pilot
  contract({
    id: "relayers",
    label: "Relayers allowed to submit",
    group: "relayer",
    kind: "address",
    defaultValue: null,
    allowed: "Add or remove",
  }),
  contract({
    id: "splitSigner",
    label: "Split signer",
    hint: "Signs every split table",
    group: "relayer",
    kind: "address",
    defaultValue: null,
    allowed: "Any address",
  }),
  server({
    id: "relayer_gas_alarm_eth",
    label: "Gas alarm line",
    group: "relayer",
    kind: "eth",
    defaultValue: null,
    allowed: "Above the stop line",
  }),
  server({
    id: "relayer_gas_stop_eth",
    label: "Gas stop line",
    group: "relayer",
    kind: "eth",
    defaultValue: null,
    allowed: "Below the alarm line",
  }),
  server({
    id: "payments_pilot_only",
    label: "Pilot creators only",
    group: "relayer",
    kind: "bool",
    defaultValue: "true",
    allowed: "On or off",
  }),
  server({
    id: "payments_pilot_creators",
    label: "Pilot creators",
    hint: "Handles that can sell while the pilot is on",
    group: "relayer",
    kind: "handles",
    defaultValue: "",
    allowed: "Add or remove handles",
  }),
];

export const PAYMENT_ITEM_BY_ID: Record<string, PaymentItem> = Object.fromEntries(
  PAYMENT_ITEMS.map(item => [item.id, item])
);

/** Change statuses (spec 3.7). "approved" with a future effective date reads as Scheduled. */
export type AdminChangeStatus =
  | "draft"
  | "approved"
  | "proposed"
  | "applied"
  | "rejected"
  | "expired"
  | "superseded";

export const ADMIN_CHANGE_STATUSES: AdminChangeStatus[] = [
  "draft",
  "approved",
  "proposed",
  "applied",
  "rejected",
  "expired",
  "superseded",
];

/** Drafts expire after 7 days unapproved (spec 3.5). */
export const ADMIN_CHANGE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A platform fee increase takes effect at least 30 days out (decision 4). */
export const FEE_INCREASE_NOTICE_DAYS = 30;

/** Longest reason an admin can give (admin_changes.reason). */
export const ADMIN_CHANGE_REASON_MAX = 500;

/** Longest stored value (admin_changes.old_value and new_value). */
export const ADMIN_CHANGE_VALUE_MAX = 1024;

const USDC_UNITS = 1_000_000n;

/** "500000" to "0.50 USDC" */
export function formatUsdcUnits(units: string | bigint, withUnit = true): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const whole = value / USDC_UNITS;
  const cents = (value % USDC_UNITS) / 10_000n;
  const text = `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return withUnit ? `${text} USDC` : text;
}

/** "500" to "5.00%" */
export function formatBps(bps: string | number): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

function plural(count: number, word: string): string {
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : word}`;
}

function formatSeconds(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return plural(seconds / 3600, "hours");
  if (seconds >= 60 && seconds % 60 === 0) return plural(seconds / 60, "minutes");
  return plural(seconds, "seconds");
}

/** A stored value in words for the admin pages and the change log. */
export function formatPaymentValue(item: PaymentItem, value: string | null | undefined): string {
  if (value === null || value === undefined) return "Not set";
  switch (item.kind) {
    case "bool":
      if (item.id === "payments_paused") return value === "true" ? "Paused" : "Open";
      return value === "true" ? "On" : "Off";
    case "bps":
      return formatBps(value);
    case "int": {
      const count = Number(value);
      if (item.unit === "seconds") return formatSeconds(count);
      return item.unit ? plural(count, item.unit) : count.toLocaleString("en-US");
    }
    case "usdc":
      return formatUsdcUnits(value);
    case "usdc_range": {
      const [min, max] = value.split(",");
      return `${formatUsdcUnits(min ?? "0", false)} to ${formatUsdcUnits(max ?? "0")}`;
    }
    case "bps_range": {
      const [min, max] = value.split(",");
      return `${formatBps(min ?? "0").replace(".00", "")} to ${formatBps(max ?? "0").replace(".00", "")}`;
    }
    case "eth":
      return `${value} ETH`;
    case "handles": {
      const handles = value.split(",").filter(Boolean);
      return handles.length === 0 ? "None" : plural(handles.length, "creators");
    }
    case "address":
      return value;
  }
}
