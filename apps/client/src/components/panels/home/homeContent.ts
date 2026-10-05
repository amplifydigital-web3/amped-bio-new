// Screen Review 016. Home copy, approved in the wording pass (D1). Compliance
// copy: change it only with counsel sign off.

/**
 * HOME_CONVERSION_COPY (016 I07, D1). The conversion and tradability
 * paragraphs render only when this is on. It ships off until counsel
 * approves the wording.
 */
export const HOME_CONVERSION_COPY = import.meta.env.VITE_HOME_CONVERSION_COPY === "true";

/**
 * D2 (alternative kept): the onboarding.ampedbio.com page as an Updates
 * section. Off until that site drops the conversion and tradability
 * paragraphs, so the frame cannot bypass HOME_CONVERSION_COPY.
 */
export const HOME_UPDATES_FRAME = import.meta.env.VITE_HOME_UPDATES_FRAME === "true";

export const UPDATES_URL = "https://onboarding.ampedbio.com/";

export const TESTNET_PARAGRAPHS = {
  testing:
    "Revolution Network runs on Libertas Testnet for testing, not production use. You may see bugs, downtime or data errors while the team prepares Mainnet.",
  conversion:
    "tREVO is planned to convert to REVO 1:1 when mainnet launches. Timing is not set, the process can differ by holder (for example a lock or a gradual release), and conversion is not guaranteed.",
  conversionScope: "This includes tREVO from staking rewards, the faucet and referrals.",
  tradability: "tREVO cannot be traded for any other asset.",
  thanks:
    "Thank you for testing Revolution Network. Your feedback helps build a more secure and reliable Mainnet.",
};

export const NETWORK_LINKS = [
  {
    id: "explorer",
    label: "Block explorer",
    value: "libertas.revoscan.io",
    href: "https://libertas.revoscan.io",
  },
  {
    id: "telegram",
    label: "Community on Telegram",
    value: "t.me/the_revolution_network",
    href: "https://t.me/the_revolution_network",
  },
] as const;

export const VIDEO_GUIDES = [
  { id: "N3DTynIurzA", title: "Set up your Amped.Bio page" },
  { id: "j_TED4IA4bc", title: "Get testnet tREVO from the faucet" },
  { id: "f8rPVnbNqlk", title: "Stake in a pool and claim rewards" },
  { id: "iXVPAD3HgQE", title: "Create your own pool" },
] as const;
