import { isRelayerConfigured } from "../usdc/relayer";
import { ampedPayAddress } from "./onchain";
import { isSplitSignerConfigured } from "./split";

/**
 * AmpedPay can take payments in this environment: the contract address is set and the relayer
 * and split signer accounts are configured (PAY-2). The pause and the live contract state are
 * checked per payment.
 */
export function paymentsReady(): boolean {
  return Boolean(ampedPayAddress()) && isRelayerConfigured() && isSplitSignerConfigured();
}
