// Public site URL where all public pages are hosted.
// Falls back to the reward URL env var (dev points at the local landing page).
export const SITE_URL = (import.meta.env.VITE_REWARD_URL || "https://amped.bio").replace(
  /\/$/,
  ""
);
