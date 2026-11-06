import {
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  AMPEDPAY_CONTRACT,
  PAYMENT_ITEM_BY_ID,
  parseAddressListChange,
  type PaymentItem,
} from "@repo/constants";
import { AMPEDPAY_ABI, AMPEDPAY_ROLES } from "@repo/web3";
import type { ContractState } from "./onchain";
import { PaymentSettingError, type ContractLimits } from "./settings";

/**
 * On chain values (spec 3.2, 3.6 step 1). The server checks the contract range and the
 * server values that depend on it before a draft is saved, so the Safe only ever sees a
 * transaction the contract accepts. Each change becomes one call on the AmpedPay proxy.
 */

const C = AMPEDPAY_CONTRACT;
const INT = /^(0|[1-9]\d*)$/;

export interface ContractValidateContext {
  state: ContractState;
  limits: ContractLimits;
  /** Relayers allowed now, checked on chain */
  relayers: Address[];
  /** Current stored value of every server item, keyed by item id */
  serverValues: Record<string, string>;
}

function int(value: string, label: string): number {
  if (!INT.test(value)) throw new PaymentSettingError(`${label} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new PaymentSettingError(`${label} is too large.`);
  return parsed;
}

function units(value: string, label: string): bigint {
  if (!INT.test(value)) {
    throw new PaymentSettingError(`${label} must be a whole number of micro USDC.`);
  }
  return BigInt(value);
}

function address(value: string, label: string): Address {
  if (!isAddress(value)) throw new PaymentSettingError(`${label} must be a 0x address.`);
  const checksummed = getAddress(value);
  if (checksummed === zeroAddress) throw new PaymentSettingError(`${label} cannot be zero.`);
  return checksummed;
}

function pct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function requireContractItem(itemId: string): PaymentItem {
  const item = PAYMENT_ITEM_BY_ID[itemId];
  if (!item || item.target !== "contract") {
    throw new PaymentSettingError("That value is not stored in the contract.");
  }
  return item;
}

/** Current value of a contract item in the stored encoding, read from the live state. */
export function currentContractValue(
  itemId: string,
  state: ContractState,
  relayers: Address[]
): string {
  switch (itemId) {
    case "feeFloorBps":
      return String(state.feeFloorBps);
    case "minCreatorBps":
      return String(state.minCreatorBps);
    case "maxRecipients":
      return String(state.maxRecipients);
    case "maxSplitValidity":
      return String(state.maxSplitValidity);
    case "minPayment":
      return state.minPayment.toString();
    case "maxPayment":
      return state.maxPayment.toString();
    case "treasury":
      return state.treasury;
    case "splitSigner":
      return state.splitSigner;
    case "relayers":
      return relayers.join(",");
    case "contract_paused":
      return String(state.paused);
  }
  throw new PaymentSettingError("That value is not stored in the contract.");
}

/**
 * Checks a new on chain value against the contract range (spec 3.2) and the server bounds
 * that depend on it (spec 3.6 step 1), and returns the canonical encoding.
 */
export function validateContractValue(
  itemId: string,
  raw: string,
  context: ContractValidateContext
): string {
  requireContractItem(itemId);
  const value = raw.trim();
  const { state, relayers, serverValues } = context;
  const server = (id: string) => serverValues[id] ?? "";
  const platformFee = Number(server("platform_fee_bps"));
  const promoterMax = Number((server("promoter_share").split(",")[1] ?? "0") || 0);

  switch (itemId) {
    case "feeFloorBps": {
      const bps = int(value, "Fee floor");
      if (bps > C.MAX_FEE_BPS) {
        throw new PaymentSettingError("The fee floor must be between 0.00% and 10.00%.");
      }
      if (bps + state.minCreatorBps > C.BPS) {
        throw new PaymentSettingError(
          `With the creator minimum at ${pct(state.minCreatorBps)} the fee floor can be at most ${pct(C.BPS - state.minCreatorBps)}.`
        );
      }
      if (bps > platformFee) {
        throw new PaymentSettingError(
          `The platform fee is ${pct(platformFee)}. Raise the platform fee first, then the floor.`
        );
      }
      return String(bps);
    }

    case "minCreatorBps": {
      const bps = int(value, "Creator minimum");
      if (bps < C.MIN_CREATOR_BPS_FLOOR || bps > C.BPS) {
        throw new PaymentSettingError("The creator minimum must be between 50.00% and 100.00%.");
      }
      if (bps + state.feeFloorBps > C.BPS) {
        throw new PaymentSettingError(
          `With the fee floor at ${pct(state.feeFloorBps)} the creator minimum can be at most ${pct(C.BPS - state.feeFloorBps)}.`
        );
      }
      if (platformFee + promoterMax > C.BPS - bps) {
        throw new PaymentSettingError(
          "The platform fee plus the promoter maximum would take the creator below this minimum. Lower one of them first."
        );
      }
      return String(bps);
    }

    case "maxRecipients": {
      const count = int(value, "Recipients per payment");
      if (count < C.MIN_RECIPIENTS || count > C.MAX_RECIPIENTS_CAP) {
        throw new PaymentSettingError("Recipients per payment must be between 2 and 8.");
      }
      return String(count);
    }

    case "maxSplitValidity": {
      const seconds = int(value, "Split limit");
      if (seconds < C.MIN_SPLIT_VALIDITY || seconds > C.MAX_SPLIT_VALIDITY_CAP) {
        throw new PaymentSettingError("The split limit must be between 1 minute and 24 hours.");
      }
      if (seconds < Number(server("quote_window_seconds"))) {
        throw new PaymentSettingError(
          "The quote window is longer than this split limit. Shorten the quote window first."
        );
      }
      return String(seconds);
    }

    case "minPayment": {
      const amount = units(value, "Contract minimum");
      if (amount < C.MIN_PAYMENT_FLOOR || amount > state.maxPayment) {
        throw new PaymentSettingError(
          "The contract minimum must be between 0.01 USDC and the contract maximum."
        );
      }
      const priceMin = BigInt(server("one_time_price").split(",")[0] || "0");
      if (amount > priceMin) {
        throw new PaymentSettingError(
          "The one time price minimum is below this value. Raise the price minimum first."
        );
      }
      return amount.toString();
    }

    case "maxPayment": {
      const amount = units(value, "Contract maximum");
      if (amount < state.minPayment || amount > C.MAX_PAYMENT_CAP) {
        throw new PaymentSettingError(
          "The contract maximum must be between the contract minimum and 100,000.00 USDC."
        );
      }
      const priceMax = BigInt(server("one_time_price").split(",")[1] || "0");
      if (amount < priceMax) {
        throw new PaymentSettingError(
          "The one time price maximum is above this value. Lower the price maximum first."
        );
      }
      const daily = BigInt(server("purchase_usdc_per_day_per_account") || "0");
      if (daily > amount * 20n) {
        throw new PaymentSettingError(
          "USDC per account per day would exceed 20 times this maximum. Lower the daily limit first."
        );
      }
      return amount.toString();
    }

    case "treasury":
    case "splitSigner": {
      const next = address(value, itemId === "treasury" ? "The treasury" : "The split signer");
      return next;
    }

    case "relayers": {
      const change = parseAddressListChange(value);
      if (!change) {
        throw new PaymentSettingError("Add or remove one relayer address at a time.");
      }
      const target = address(change.address, "The relayer");
      const allowed = relayers.includes(target);
      if (change.action === "add" && allowed) {
        throw new PaymentSettingError("That address can already submit payments.");
      }
      if (change.action === "remove" && !allowed) {
        throw new PaymentSettingError("That address is not an allowed relayer.");
      }
      if (change.action === "remove" && relayers.length === 1) {
        throw new PaymentSettingError(
          "This is the only relayer. Add its replacement first, or pause the contract."
        );
      }
      return `${change.action}:${target}`;
    }

    case "contract_paused": {
      if (value !== "false") {
        throw new PaymentSettingError(
          "Pause applies at once from Overview. Only Resume is drafted."
        );
      }
      if (!state.paused) throw new PaymentSettingError("The contract is not paused.");
      return "false";
    }
  }
  throw new PaymentSettingError("That value is not stored in the contract.");
}

export interface ContractCall {
  to: Address;
  data: Hex;
  /** Plain words for the call, for the Safe review and the fallback */
  method: string;
}

/** The AmpedPay call an approved change becomes (spec 3.6 step 3). Value is always 0. */
export function encodeContractCall(contract: Address, itemId: string, value: string): ContractCall {
  const call = (data: Hex, method: string): ContractCall => ({ to: contract, data, method });
  switch (itemId) {
    case "feeFloorBps":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setFeeFloorBps",
          args: [Number(value)],
        }),
        `setFeeFloorBps(${value})`
      );
    case "minCreatorBps":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setMinCreatorBps",
          args: [Number(value)],
        }),
        `setMinCreatorBps(${value})`
      );
    case "maxRecipients":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setMaxRecipients",
          args: [Number(value)],
        }),
        `setMaxRecipients(${value})`
      );
    case "maxSplitValidity":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setMaxSplitValidity",
          args: [Number(value)],
        }),
        `setMaxSplitValidity(${value})`
      );
    case "minPayment":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setMinPayment",
          args: [BigInt(value)],
        }),
        `setMinPayment(${value})`
      );
    case "maxPayment":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setMaxPayment",
          args: [BigInt(value)],
        }),
        `setMaxPayment(${value})`
      );
    case "treasury":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setTreasury",
          args: [getAddress(value)],
        }),
        `setTreasury(${getAddress(value)})`
      );
    case "splitSigner":
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName: "setSplitSigner",
          args: [getAddress(value)],
        }),
        `setSplitSigner(${getAddress(value)})`
      );
    case "relayers": {
      const change = parseAddressListChange(value);
      if (!change) throw new PaymentSettingError("Add or remove one relayer address at a time.");
      const account = getAddress(change.address);
      const functionName = change.action === "add" ? "grantRole" : "revokeRole";
      return call(
        encodeFunctionData({
          abi: AMPEDPAY_ABI,
          functionName,
          args: [AMPEDPAY_ROLES.RELAYER_ROLE, account],
        }),
        `${functionName}(RELAYER_ROLE, ${account})`
      );
    }
    case "contract_paused":
      return call(encodeFunctionData({ abi: AMPEDPAY_ABI, functionName: "unpause" }), "unpause()");
  }
  throw new PaymentSettingError("That value is not stored in the contract.");
}

/** The pause call the pauser account sends (spec 3.2: PAUSER_ROLE, decision 2). */
export function encodePauseCall(contract: Address): ContractCall {
  return {
    to: contract,
    data: encodeFunctionData({ abi: AMPEDPAY_ABI, functionName: "pause" }),
    method: "pause()",
  };
}
