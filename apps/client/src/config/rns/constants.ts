import { Duration } from "@/types/rns/common";

export const NAME_REQUIREMENTS = {
  minLength: 3,
  maxLength: 64,
  validCharacters: /^[a-z0-9-]+$/,
};

export const REGISTRATION_DURATIONS: Record<Duration, number> = {
  "1_year": 31536000,
  "2_years": 63072000,
  "3_years": 94608000,
  "5_years": 157680000,
};

export const DOMAIN_SUFFIX = ".revotest.eth";

// Price feed URL for tREVO price
export const PRICE_FEED_URL = "";
