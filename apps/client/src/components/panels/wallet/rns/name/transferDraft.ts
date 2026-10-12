import type { Address } from "viem";

export type TransferStep = "recipient" | "review" | "confirm" | "result";

/** Recipient and step outlive the panel, so closing mid transfer keeps them (080 I09). */
export type TransferDraft = {
  input: string;
  step: TransferStep;
  to: { address: Address; label: string | null } | null;
};

export const EMPTY_TRANSFER_DRAFT: TransferDraft = { input: "", step: "recipient", to: null };
