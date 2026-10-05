import { TESTNET_NOTICE } from "@repo/ui";

/**
 * Revolution Name Service (RNS) vocabulary (Screen Review 100 I09). Every RNS
 * surface imports these, so the words read the same everywhere. The two public
 * strings are mirrored in apps/landingpage.
 */
export const RNS_COPY = {
  /** First mention on a surface */
  firstMention: "Revolution Name Service (RNS)",
  short: "RNS",
  /** One name, example mayalin.revo */
  name: "RNS name",
  names: "RNS names",
  walletTab: "RNS",
  findTitle: "Find an RNS name",
  myNamesTitle: "My RNS names",
  aboutTitle: "About Revolution Name Service",
  pageField: "RNS name",
  manageLink: "Manage in Wallet",
  verifiedBy: "Verified by Authbase",
  verifiedDisclaimer: "Verified means the identity check passed. It is not an endorsement.",
  linkedLine: "This name points to this page's wallet.",
  attribute: "A fact about you, checked by an issuer and held with your RNS name.",
  facet: "A yes or no answer about you, backed by a zero knowledge proof.",
  /** J0, where tREVO appears */
  testnetLine: TESTNET_NOTICE,
} as const;
