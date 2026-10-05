import { getRnsSuffix, RNS_CHAIN } from "@repo/web3";
import { Duration } from "@/types/rns/common";

export const NAME_REQUIREMENTS = {
  minLength: 6,
  maxLength: 32,
  validCharacters: /^[a-z0-9-]+$/,
};

export const REGISTRATION_DURATIONS: Record<Duration, number> = {
  "1_year": 31536000,
  "2_years": 63072000,
  "3_years": 94608000,
  "5_years": 157680000,
};

/**
 * @deprecated Use formatRnsName and parseRnsInput from @repo/web3. Kept only
 * until the Send recipient picker moves to parseRnsInput (row 110). The value
 * comes from chain config, so there is one suffix source (100 I01).
 */
export const DOMAIN_SUFFIX = getRnsSuffix(RNS_CHAIN.id);

// Price feed URL for tREVO price
export const PRICE_FEED_URL = "";
