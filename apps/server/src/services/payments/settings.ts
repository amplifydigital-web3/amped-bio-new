import { getAddress, isAddress, parseEther } from "viem";
import { prisma } from "@repo/database";
import {
  AMPEDPAY_CONTRACT,
  FEE_INCREASE_NOTICE_DAYS,
  HANDLE_MIN_LENGTH,
  HANDLE_REGEX,
  PAYMENT_ITEMS,
  PAYMENT_ITEM_BY_ID,
  ADMIN_CHANGE_VALUE_MAX,
  type PaymentItem,
} from "@repo/constants";
import { env } from "../../env";

/**
 * AmpedPay settings (Build Board #50, spec docs/features/ampedpay.md 3.3). Every server
 * value lives in site_settings under the catalog keys in @repo/constants. Reads go through
 * paymentSettings(), cached 30 seconds, with the catalog defaults when a row is missing.
 * Writes happen only through an approved AdminChange (services/payments/changes.ts).
 */

export class PaymentSettingError extends Error {}

const CACHE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Every site_settings key the catalog writes. */
export const PAYMENT_SETTING_KEYS: string[] = PAYMENT_ITEMS.filter(
  item => item.target === "server"
).flatMap(item => item.keys);

/** Contract values the server bounds depend on (spec 3.2). Deploy defaults until PAY-A2 reads Base. */
export interface ContractLimits {
  source: "deploy";
  feeFloorBps: number;
  minCreatorBps: number;
  maxRecipients: number;
  maxSplitValidity: number;
  minPayment: bigint;
  maxPayment: bigint;
}

export function contractLimits(): ContractLimits {
  const d = AMPEDPAY_CONTRACT.defaults;
  return {
    source: "deploy",
    feeFloorBps: d.feeFloorBps,
    minCreatorBps: d.minCreatorBps,
    maxRecipients: d.maxRecipients,
    maxSplitValidity: d.maxSplitValidity,
    minPayment: d.minPayment,
    maxPayment: d.maxPayment,
  };
}

/** Stored value of every contract item, for Settings. Addresses come from the deploy (env). */
export function contractValues(limits = contractLimits()): Record<string, string | null> {
  const safe =
    env.AMPEDPAY_SAFE && isAddress(env.AMPEDPAY_SAFE) ? getAddress(env.AMPEDPAY_SAFE) : null;
  return {
    feeFloorBps: String(limits.feeFloorBps),
    MAX_FEE_BPS: String(AMPEDPAY_CONTRACT.MAX_FEE_BPS),
    minCreatorBps: String(limits.minCreatorBps),
    maxRecipients: String(limits.maxRecipients),
    maxSplitValidity: String(limits.maxSplitValidity),
    minPayment: limits.minPayment.toString(),
    maxPayment: limits.maxPayment.toString(),
    // Decision 3: each environment's Safe is also its treasury
    treasury: safe,
    // Read from the contract roles in PAY-A2
    splitSigner: null,
    relayers: null,
  };
}

/** Defaults that come from the environment rather than the catalog. */
function envDefault(key: string): string | null {
  if (key === "relayer_gas_alarm_eth") return env.RELAYER_GAS_ALARM_ETH;
  if (key === "relayer_gas_stop_eth") return env.RELAYER_GAS_STOP_ETH;
  return null;
}

/** Default stored value for one site_settings key. */
export function defaultForKey(key: string): string {
  for (const item of PAYMENT_ITEMS) {
    const index = item.keys.indexOf(key);
    if (index === -1) continue;
    if (item.defaultValue === null) return envDefault(key) ?? "";
    if (item.keys.length === 2) return item.defaultValue.split(",")[index] ?? "";
    return item.defaultValue;
  }
  return envDefault(key) ?? "";
}

/** One item's stored value from a key map: ranges join their two keys as "min,max". */
export function itemValue(item: PaymentItem, keys: Record<string, string>): string {
  return item.keys.map(key => keys[key] ?? defaultForKey(key)).join(",");
}

/** The site_settings rows an item value writes. */
export function itemRows(item: PaymentItem, value: string): { key: string; value: string }[] {
  if (item.keys.length === 1) return [{ key: item.keys[0]!, value }];
  const parts = value.split(",");
  return item.keys.map((key, index) => ({ key, value: parts[index] ?? "" }));
}

export interface PaymentSettings {
  paymentsPaused: boolean;
  platformFeeBps: number;
  oneTimePriceMin: bigint;
  oneTimePriceMax: bigint;
  promoterShareMinBps: number;
  promoterShareMaxBps: number;
  quoteWindowSeconds: number;
  softUnlockConfirmations: number;
  finalConfirmations: number;
  purchasesPerDayPerAccount: number;
  purchaseUsdcPerDayPerAccount: bigint;
  promoterRefundPauseRateBps: number;
  refundWindowDays: number;
  relayerGasAlarmEth: string;
  relayerGasStopEth: string;
  pilotOnly: boolean;
  pilotCreators: string[];
  /** Stored value of every server item, keyed by item id, for the admin pages */
  values: Record<string, string>;
}

export function parseSettings(keys: Record<string, string>): PaymentSettings {
  const get = (key: string) => keys[key] ?? defaultForKey(key);
  const values: Record<string, string> = {};
  for (const item of PAYMENT_ITEMS) {
    if (item.target === "server") values[item.id] = itemValue(item, keys);
  }
  return {
    paymentsPaused: get("payments_paused") === "true",
    platformFeeBps: Number(get("platform_fee_bps")),
    oneTimePriceMin: BigInt(get("one_time_price_min")),
    oneTimePriceMax: BigInt(get("one_time_price_max")),
    promoterShareMinBps: Number(get("promoter_share_min")),
    promoterShareMaxBps: Number(get("promoter_share_max")),
    quoteWindowSeconds: Number(get("quote_window_seconds")),
    softUnlockConfirmations: Number(get("soft_unlock_confirmations")),
    finalConfirmations: Number(get("final_confirmations")),
    purchasesPerDayPerAccount: Number(get("purchases_per_day_per_account")),
    purchaseUsdcPerDayPerAccount: BigInt(get("purchase_usdc_per_day_per_account")),
    promoterRefundPauseRateBps: Number(get("promoter_refund_pause_rate")),
    refundWindowDays: Number(get("refund_window_days")),
    relayerGasAlarmEth: get("relayer_gas_alarm_eth"),
    relayerGasStopEth: get("relayer_gas_stop_eth"),
    pilotOnly: get("payments_pilot_only") === "true",
    pilotCreators: get("payments_pilot_creators").split(",").filter(Boolean),
    values,
  };
}

let cache: { value: PaymentSettings; at: number } | null = null;

/** Called after every settings write in this process; other processes refresh within 30 seconds. */
export function clearPaymentSettingsCache() {
  cache = null;
}

/**
 * Applies approved server changes whose effective date has passed (decision 4: a fee
 * change carries a date and quotes keep the old value until then). The status update is
 * conditional, so two servers never apply the same change twice.
 */
export async function applyDueChanges(now = new Date()): Promise<number> {
  const due = await prisma.adminChange.findMany({
    where: { area: "payments", target: "server", status: "approved", effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "asc" },
  });
  let applied = 0;
  for (const change of due) {
    const item = PAYMENT_ITEM_BY_ID[change.key];
    if (!item) continue;
    const done = await prisma.$transaction(async tx => {
      const claimed = await tx.adminChange.updateMany({
        where: { id: change.id, status: "approved" },
        data: { status: "applied", appliedAt: now },
      });
      if (claimed.count === 0) return false;
      for (const row of itemRows(item, change.newValue)) {
        await tx.siteSettings.upsert({
          where: { setting_key: row.key },
          create: { setting_key: row.key, setting_value: row.value, value_type: valueType(item) },
          update: { setting_value: row.value, value_type: valueType(item) },
        });
      }
      return true;
    });
    if (done) applied += 1;
  }
  if (applied > 0) clearPaymentSettingsCache();
  return applied;
}

async function readKeys(): Promise<Record<string, string>> {
  const rows = await prisma.siteSettings.findMany({
    where: { setting_key: { in: PAYMENT_SETTING_KEYS } },
  });
  return Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
}

/** Every AmpedPay server value, typed, with defaults. Cached 30 seconds (spec 3.3). */
export async function paymentSettings(now = Date.now()): Promise<PaymentSettings> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  await applyDueChanges(new Date(now));
  const value = parseSettings(await readKeys());
  cache = { value, at: now };
  return value;
}

/** Relayer gas lines: the approved settings, with the env lines as the fallback (spec 3.3, P1 1). */
export async function gasLines(): Promise<{ alarmEth: string; stopEth: string }> {
  try {
    const settings = await paymentSettings();
    return { alarmEth: settings.relayerGasAlarmEth, stopEth: settings.relayerGasStopEth };
  } catch (error) {
    // A settings read must never stop a USDC send on its own: the env lines are the
    // documented fallback (spec 3.3)
    console.warn("[payments] gas lines did not load from settings, using env", error);
    return { alarmEth: env.RELAYER_GAS_ALARM_ETH, stopEth: env.RELAYER_GAS_STOP_ETH };
  }
}

export function valueType(item: PaymentItem): "STRING" | "NUMBER" | "BOOLEAN" {
  if (item.kind === "bool") return "BOOLEAN";
  if (item.kind === "bps" || item.kind === "int" || item.kind === "usdc") return "NUMBER";
  return "STRING";
}

/* ------------------------------------------------------------------ validation */

const INT = /^(0|[1-9]\d*)$/;
const ETH = /^(0|[1-9]\d*)(\.\d{1,6})?$/;

function int(value: string, label: string): number {
  if (!INT.test(value)) throw new PaymentSettingError(`${label} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new PaymentSettingError(`${label} is too large.`);
  return parsed;
}

function big(value: string, label: string): bigint {
  if (!INT.test(value))
    throw new PaymentSettingError(`${label} must be a whole number of micro USDC.`);
  return BigInt(value);
}

function between(value: number, min: number, max: number, message: string) {
  if (value < min || value > max) throw new PaymentSettingError(message);
}

function pair(value: string, label: string): [string, string] {
  const parts = value.split(",");
  if (parts.length !== 2) throw new PaymentSettingError(`${label} needs a minimum and a maximum.`);
  return [parts[0]!, parts[1]!];
}

export interface ValidateContext {
  /** Current stored value of every server item, keyed by item id */
  values: Record<string, string>;
  limits: ContractLimits;
  /** Pilot handles that exist as users, lowercase; checked by the caller */
  knownHandles?: Set<string>;
  now?: Date;
}

/**
 * Checks a new value for a server item against its range and the values it depends on
 * (spec 3.3), and returns it in the canonical encoding. Throws PaymentSettingError with
 * a sentence the admin can act on.
 */
export function validateServerValue(itemId: string, raw: string, context: ValidateContext): string {
  const item = PAYMENT_ITEM_BY_ID[itemId];
  if (!item || item.target !== "server") {
    throw new PaymentSettingError("That value is not a server setting.");
  }
  const value = raw.trim();
  const { values, limits } = context;
  const current = (id: string) => values[id] ?? itemValue(PAYMENT_ITEM_BY_ID[id]!, {});
  const creatorRoom = AMPEDPAY_CONTRACT.BPS - limits.minCreatorBps;
  const promoterMax = () => Number(pair(current("promoter_share"), "Promoter share")[1]);

  switch (itemId) {
    case "payments_paused":
    case "payments_pilot_only":
      if (value !== "true" && value !== "false") throw new PaymentSettingError("Choose on or off.");
      return value;

    case "platform_fee_bps": {
      const bps = int(value, "Platform fee");
      between(
        bps,
        limits.feeFloorBps,
        AMPEDPAY_CONTRACT.MAX_FEE_BPS,
        `The platform fee must be between the fee floor (${(limits.feeFloorBps / 100).toFixed(2)}%) and 10.00%. Lower the fee floor through the Safe first.`
      );
      if (bps + promoterMax() > creatorRoom) {
        throw new PaymentSettingError(
          "With the current promoter maximum this fee would take the creator below the creator minimum. Lower the promoter maximum first."
        );
      }
      return String(bps);
    }

    case "one_time_price": {
      const [rawMin, rawMax] = pair(value, "One time price range");
      const min = big(rawMin, "The minimum");
      const max = big(rawMax, "The maximum");
      if (min > max) throw new PaymentSettingError("The minimum must not be above the maximum.");
      if (min < limits.minPayment || max > limits.maxPayment) {
        throw new PaymentSettingError(
          "The price range must sit inside the contract minimum and maximum per payment."
        );
      }
      return `${min},${max}`;
    }

    case "promoter_share": {
      const [rawMin, rawMax] = pair(value, "Promoter share");
      const min = int(rawMin, "The minimum");
      const max = int(rawMax, "The maximum");
      if (min > max) throw new PaymentSettingError("The minimum must not be above the maximum.");
      between(max, 0, 5_000, "The promoter share must be between 0% and 50%.");
      if (Number(current("platform_fee_bps")) + max > creatorRoom) {
        throw new PaymentSettingError(
          "With the current platform fee this maximum would take the creator below the creator minimum."
        );
      }
      return `${min},${max}`;
    }

    case "quote_window_seconds": {
      const seconds = int(value, "Quote window");
      between(
        seconds,
        60,
        limits.maxSplitValidity,
        `The quote window must be between 1 minute and the split limit (${limits.maxSplitValidity / 60} minutes).`
      );
      return String(seconds);
    }

    case "soft_unlock_confirmations": {
      const blocks = int(value, "Unlock after");
      between(blocks, 1, 12, "Unlock after must be between 1 and 12 blocks.");
      if (blocks > Number(current("final_confirmations"))) {
        throw new PaymentSettingError("Unlock after must not be above Final after.");
      }
      return String(blocks);
    }

    case "final_confirmations": {
      const blocks = int(value, "Final after");
      between(
        blocks,
        Number(current("soft_unlock_confirmations")),
        64,
        "Final after must be between Unlock after and 64 blocks."
      );
      return String(blocks);
    }

    case "purchases_per_day_per_account": {
      const count = int(value, "Payments per day");
      between(count, 1, 500, "Payments per account per day must be between 1 and 500.");
      return String(count);
    }

    case "purchase_usdc_per_day_per_account": {
      const units = big(value, "USDC per day");
      if (units < 1_000_000n || units > limits.maxPayment * 20n) {
        throw new PaymentSettingError(
          "USDC per account per day must be between 1.00 USDC and 20 times the contract maximum."
        );
      }
      return units.toString();
    }

    case "promoter_refund_pause_rate": {
      const bps = int(value, "Refund rate");
      between(bps, 100, 5_000, "The refund rate must be between 1% and 50%.");
      return String(bps);
    }

    case "refund_window_days": {
      const days = int(value, "Refund window");
      between(days, 0, 365, "The refund window must be between 0 and 365 days.");
      return String(days);
    }

    case "relayer_gas_alarm_eth":
    case "relayer_gas_stop_eth": {
      if (!ETH.test(value)) {
        throw new PaymentSettingError("Enter ETH as a number with at most 6 decimal places.");
      }
      const wei = parseEther(value);
      if (wei <= 0n) throw new PaymentSettingError("The line must be above 0 ETH.");
      const alarm =
        itemId === "relayer_gas_alarm_eth" ? wei : parseEther(current("relayer_gas_alarm_eth"));
      const stop =
        itemId === "relayer_gas_stop_eth" ? wei : parseEther(current("relayer_gas_stop_eth"));
      if (stop >= alarm)
        throw new PaymentSettingError("The stop line must be below the alarm line.");
      return value;
    }

    case "payments_pilot_creators": {
      const handles = [
        ...new Set(
          value
            .split(/[\s,]+/)
            .map(handle => handle.replace(/^@/, "").toLowerCase())
            .filter(Boolean)
        ),
      ].sort();
      for (const handle of handles) {
        if (handle.length < HANDLE_MIN_LENGTH || !HANDLE_REGEX.test(handle)) {
          throw new PaymentSettingError(`@${handle} is not a valid handle.`);
        }
        if (context.knownHandles && !context.knownHandles.has(handle)) {
          throw new PaymentSettingError(`No account has the handle @${handle}.`);
        }
      }
      const joined = handles.join(",");
      if (joined.length > ADMIN_CHANGE_VALUE_MAX) {
        throw new PaymentSettingError(
          "The pilot list is too long for one change. Split it in two."
        );
      }
      return joined;
    }
  }
  throw new PaymentSettingError("That value is not a server setting.");
}

/**
 * Effective date rule for the platform fee (decision 4): an increase takes effect at least
 * 30 days out; a decrease takes any date or applies on approval. Other items apply on
 * approval and take no date.
 */
export function checkEffectiveAt(
  itemId: string,
  oldValue: string,
  newValue: string,
  effectiveAt: Date | null,
  now = new Date()
): Date | null {
  const item = PAYMENT_ITEM_BY_ID[itemId];
  if (!item?.effectiveDate) {
    if (effectiveAt)
      throw new PaymentSettingError("This value applies on approval and takes no date.");
    return null;
  }
  const increase = Number(newValue) > Number(oldValue);
  if (increase) {
    const earliest = now.getTime() + FEE_INCREASE_NOTICE_DAYS * DAY_MS;
    if (!effectiveAt || effectiveAt.getTime() < earliest - 60_000) {
      throw new PaymentSettingError(
        `A fee increase takes effect at least ${FEE_INCREASE_NOTICE_DAYS} days out so creators get notice. Pick a date on or after ${new Date(earliest).toISOString().slice(0, 10)}.`
      );
    }
    return effectiveAt;
  }
  if (effectiveAt && effectiveAt.getTime() <= now.getTime()) return null;
  return effectiveAt;
}
