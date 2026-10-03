import { getAddress, isAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";
import {
  BASE_REGISTRAR_ABI,
  checkRnsLabel,
  formatRnsName,
  isRnsNameActive,
  parseRnsInput,
  RESOLVER_ABI,
  rnsNode,
  rnsTokenId,
} from "@repo/web3";
import { useDebounce } from "@/hooks/useDebounce";
import { useAddressSummary, useRnsChain } from "../hooks";

const ZERO = "0x0000000000000000000000000000000000000000";

export type RecipientState =
  | { kind: "empty" }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      address: Address;
      /** The RNS name typed, when the person typed a name */
      label: string | null;
      /** The name's owner when it differs from where the name points (caution card) */
      ownerDiffers: boolean;
    };

/**
 * Screen Review 080 I10: the Recipient well takes a bare label, label plus
 * the chain suffix or a 0x address, resolves 400 ms after typing and names
 * the error with its fix. Shared with Send to an RNS name (110).
 */
export function useRecipient(input: string, ownerOfName: Address | null, fullName: string) {
  const chain = useRnsChain();
  const debounced = useDebounce(input.trim(), 400);
  const settled = debounced === input.trim();
  const typedAddress = isAddress(debounced) ? (getAddress(debounced) as Address) : null;
  const label = !typedAddress && debounced ? parseRnsInput(debounced, chain.id) : "";
  const validLabel = !!label && checkRnsLabel(label) === null;

  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: chain.contracts.L2_RESOLVER.address,
        abi: RESOLVER_ABI,
        functionName: "addr",
        args: [validLabel ? rnsNode(label, chain.id) : (("0x" + "0".repeat(64)) as `0x${string}`)],
        chainId: chain.id,
      },
      {
        address: chain.contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "nameExpires",
        args: [validLabel ? rnsTokenId(label) : 0n],
        chainId: chain.id,
      },
      {
        address: chain.contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [validLabel ? rnsTokenId(label) : 0n],
        chainId: chain.id,
      },
    ],
    query: { enabled: validLabel, staleTime: 15_000 },
  });

  const resolved =
    typedAddress ??
    (reads.data?.[0]?.status === "success" && reads.data[0].result !== ZERO
      ? (reads.data[0].result as Address)
      : null);
  const summary = useAddressSummary(resolved);

  let state: RecipientState;
  if (!input.trim()) state = { kind: "empty" };
  else if (!settled || (validLabel && reads.isLoading)) state = { kind: "checking" };
  else if (typedAddress && typedAddress === ZERO) {
    state = { kind: "error", message: "This is the zero address. Names sent there are lost." };
  } else if (!typedAddress && !validLabel) {
    state = { kind: "error", message: `No RNS name matches ${debounced}.` };
  } else if (!typedAddress && reads.isError) {
    state = { kind: "error", message: "We could not check this RNS name. Try again." };
  } else if (!typedAddress) {
    const expiry = reads.data?.[1]?.status === "success" ? Number(reads.data[1].result) : 0;
    const shown = formatRnsName(label, chain.id);
    if (!expiry) state = { kind: "error", message: `No RNS name matches ${shown}.` };
    else if (!isRnsNameActive(expiry)) {
      state = { kind: "error", message: `${shown} has expired. It cannot receive RNS names.` };
    } else if (!resolved) {
      state = { kind: "error", message: `${shown} does not point to a wallet yet.` };
    } else {
      const owner = reads.data?.[2]?.status === "success" ? (reads.data[2].result as string) : "";
      state = {
        kind: "ok",
        address: resolved,
        label,
        ownerDiffers: !!owner && owner.toLowerCase() !== resolved.toLowerCase(),
      };
    }
  } else {
    state = { kind: "ok", address: typedAddress, label: null, ownerDiffers: false };
  }

  if (
    state.kind === "ok" &&
    ownerOfName &&
    state.address.toLowerCase() === ownerOfName.toLowerCase()
  ) {
    state = { kind: "error", message: `You already own ${fullName}. Choose another wallet.` };
  }

  return { state, summary: summary.data ?? null, summaryLoading: summary.isLoading };
}
