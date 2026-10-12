// Screen Review 065 and 066: approved wording for the create pool flow (065 D2
// wording approved 30 Sep; Rob's call of 30 Sep: "Creator share" on every
// screen). Kept in one place so counsel changes land in one file.

export const INITIAL_STAKE = "0.0015";
export const STEPS = ["Amount", "Review", "Confirm in wallet"];
export const CREATOR_SHARE_PRESETS = [0, 3, 5, 10];
export const DEFAULT_CREATOR_SHARE = 5;
export const DESCRIPTION_MAX = 500;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// "Create your own pool" video (Rob, 1 Oct)
export const WATCH_HOW_VIDEO = { id: "iXVPAD3HgQE", title: "Create your own pool" };

export const COPY = {
  eyebrow: "Create pool",
  intro: "Launch a pool your fans can stake tREVO in to earn network rewards and support you.",
  howEyebrow: "How pools work",
  how: "Fans stake tREVO in your pool to earn network rewards and support you. Your pool is delegated to a network node. When that node wins block batches, the network pays rewards in tREVO. The node keeps a cut. Your pool receives its share. You keep the creator share you set at launch. Fans share the rest by the size of their stake. Rewards vary and are not guaranteed.",
  emptyTitle: "Set up your pool",
  emptyBody: "Give fans a pool on your page they can stake tREVO in.",
  shareInfo: "Your share of pool rewards, 0 to 100%. You cannot change it after launch.",
  nameHelper: "Shown on your pool card and in Explore. You cannot change it after launch.",
  descriptionHelper: "Tell fans what your pool is for. You can edit this later.",
  imageHelper: "Square image, at least 400 x 400, up to 5 MB.",
  stakeHelper: "Sent from your wallet when you launch.",
  lowBalance: "You need at least 0.0015 tREVO plus the network fee to create a pool.",
  staleNotice:
    "Your earlier pool setup did not finish on chain, so it was cleared. Set it up again below.",
  launchTerms:
    "Creating a pool stakes 0.0015 tREVO from your wallet. Once launched, your pool is live and fans can stake. The creator share and the initial stake cannot be changed after launch.",
  checkbox:
    "I understand the pool name, creator share and initial stake cannot be changed after launch.",
  shareSublabel: "Your share of pool rewards",
  imageFailed: "Pool image did not upload. Add it from My Pool.",
};

/** 065 D1 split line (approved board wording) with the 100% case (J3). */
export function shareHelper(share: number) {
  if (share >= 100) {
    return "You keep 100% of pool rewards. Fans in your pool receive no rewards. You cannot change the creator share after launch.";
  }
  return `You keep ${share}% of pool rewards. Fans share ${100 - share}%. You cannot change the creator share after launch.`;
}

// Preview card line at 100% (fan facing, J3)
export const FULL_SHARE_CARD =
  "The creator keeps 100% of pool rewards. Fans in this pool receive no rewards.";
