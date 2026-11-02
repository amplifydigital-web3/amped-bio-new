import { serializeTransaction, type Hex } from "viem";
import { CdpError } from "../usdc/cdp";
import { cdpNetwork, paymentClient } from "../usdc/chain";
import { accountAddress, isAccountConfigured, paymentsCdp } from "./accounts";
import type { ContractCall } from "./contractChanges";

/**
 * Pause through the pauser account (spec 3.2, decision 2). A CDP Server Wallet account holds
 * PAUSER_ROLE and its CDP policy allows only pause() on AmpedPay, so a stolen admin session
 * can stop payments but never move money or resume them.
 */

export class PauserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PauserError";
  }
}

/** Test seam: replaces the CDP send. */
type Sender = (call: ContractCall, idempotencyKey: string) => Promise<Hex>;

const cdpSender: Sender = async (call, idempotencyKey) => {
  if (!isAccountConfigured("pauser")) {
    throw new PauserError("The pauser account is not set up. Pause the contract from the Safe.");
  }
  let from;
  try {
    from = await accountAddress("pauser");
  } catch (error) {
    console.error("[payments] pauser account did not load", error);
    throw new PauserError("The pauser account did not answer. Pause the contract from the Safe.");
  }
  // Estimate first so a missing role or an empty gas balance never reaches CDP
  try {
    await paymentClient().estimateGas({ account: from, to: call.to, data: call.data, value: 0n });
  } catch (error) {
    console.error("[payments] pause would revert", error);
    throw new PauserError(
      "The contract would refuse the pause. Check the pauser role and its ETH, or pause from the Safe."
    );
  }
  const transaction = serializeTransaction({
    chainId: 1,
    type: "eip1559",
    to: call.to,
    data: call.data,
    value: 0n,
  });
  try {
    const { transactionHash } = await paymentsCdp().sendEvmTransaction(
      from,
      { network: cdpNetwork(), transaction },
      idempotencyKey
    );
    return transactionHash;
  } catch (error) {
    if (error instanceof CdpError) {
      console.error("[payments] CDP refused the pause", {
        status: error.status,
        type: error.errorType,
        correlationId: error.correlationId,
      });
    }
    throw new PauserError("Coinbase did not accept the pause. Pause the contract from the Safe.");
  }
};

let sender: Sender = cdpSender;

export function setPauserSenderForTests(next: Sender | null) {
  sender = next ?? cdpSender;
}

export function pauseThroughPauser(call: ContractCall, idempotencyKey: string): Promise<Hex> {
  return sender(call, idempotencyKey);
}
