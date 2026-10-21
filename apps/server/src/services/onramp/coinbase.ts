import { env } from "../../env";
import { CdpClient } from "../usdc/cdp";

/**
 * Buy USDC through Coinbase (Build Board #5), spec 3.5. The Onramp calls go
 * through the same CDP REST client as the relayer, signed with the CDP API key.
 * Coinbase is the seller: every price, fee and limit shown to the fan comes
 * from these calls, never from Amped.Bio.
 */

export type OnrampApi = Pick<
  CdpClient,
  | "getOnrampBuyConfig"
  | "getOnrampBuyOptions"
  | "getOnrampTransactions"
  | "createOnrampSession"
  | "createOnrampOrder"
  | "getOnrampOrder"
>;

let override: OnrampApi | null = null;
let client: CdpClient | null = null;

/** Test seam. */
export function setOnrampApiForTests(api: OnrampApi | null) {
  override = api;
  client = null;
}

/** On when the server switch is on and a CDP API key is present. */
export function isOnrampConfigured(): boolean {
  return env.ONRAMP_ENABLED && !!env.CDP_API_KEY_ID && !!env.CDP_API_KEY_SECRET;
}

export function onrampApi(): OnrampApi {
  if (override) return override;
  if (!client) {
    client = new CdpClient({
      apiKeyId: env.CDP_API_KEY_ID,
      apiKeySecret: env.CDP_API_KEY_SECRET,
      walletSecret: env.CDP_WALLET_SECRET,
    });
  }
  return client;
}
