import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./handle";
import { rnsRouter } from "./rns";
import { adminRouter } from "./admin/index";
import { uploadRouter } from "./upload";
import { themeRouter } from "./theme";
import { themeGalleryRouter } from "./themeGallery";
import { walletRouter } from "./wallet";
import { blocksRouter } from "./blocks";
import { poolsRouter } from "./pools/index";
import { publicSettingsRouter } from "./publicSettings";
import { referralRouter } from "./referral";
import { referralInviteRouter } from "./referralInvite";
import { ndauConversionRouter } from "./ndauConversion";
import { authbaseRouter } from "./authbase";
import { analyticsRouter } from "./analytics";
import { trackingPixelsRouter } from "./trackingPixels";
import { oauthAppsRouter } from "./oauthApps";
import { followRouter } from "./follow";
import { broadcastRouter } from "./broadcast";
import { onboardingRouter } from "./onboarding";
import { telegramRouter } from "./telegram";
import { messagingRouter } from "./messaging";
import { messagesRouter } from "./messages";
import { realtimeRouter } from "./realtime";
import { pushRouter } from "./push";
import { usdcRouter } from "./usdc";
import { onrampRouter } from "./onramp";
import { contentRouter } from "./content";
import { notificationsRouter } from "./notifications";
import { progressRouter } from "./progress";
import { libraryRouter } from "./library";
import { checkoutRouter } from "./checkout";
import { storeRouter } from "./store";
import { paymentsRouter } from "./payments";
import { membershipsRouter } from "./memberships";
import { identityRouter } from "./identity";
import { accessRouter } from "./access";
import { inferRouterOutputs } from "@trpc/server";

// Merge all routers
const mergedRouter = router({
  handle: appRouter,
  rns: rnsRouter,
  user: userRouter,
  auth: authRouter,
  referral: referralRouter,
  // Home Get tREVO: invite stats across every referral
  referralInvite: referralInviteRouter,
  admin: adminRouter,
  upload: uploadRouter,
  theme: themeRouter,
  themeGallery: themeGalleryRouter,
  wallet: walletRouter,
  blocks: blocksRouter,
  pools: poolsRouter,
  public: publicSettingsRouter,
  ndauConversion: ndauConversionRouter,
  authbase: authbaseRouter,
  analytics: analyticsRouter,
  trackingPixels: trackingPixelsRouter,
  oauthApps: oauthAppsRouter,
  follow: followRouter,
  broadcast: broadcastRouter,
  onboarding: onboardingRouter,
  telegram: telegramRouter,
  messaging: messagingRouter,
  messages: messagesRouter,
  realtime: realtimeRouter,
  push: pushRouter,
  // USDC in the wallet (Build Board #29): gasless send and USDC activity
  usdc: usdcRouter,
  // Buy USDC through Coinbase (Build Board #5)
  onramp: onrampRouter,
  content: contentRouter,
  // Account notification settings (RNS name reminders)
  notifications: notificationsRouter,
  // Fan Library (#26) phase A: playback position per account
  progress: progressRouter,
  library: libraryRouter,
  // Mobile checkout intents (Build Board #49), behind the checkout feature flag
  checkout: checkoutRouter,
  // Creator stores (content PR 9, C9)
  store: storeRouter,
  payments: paymentsRouter,
  // Memberships core (MB-1, Build Board #25 and #51)
  memberships: membershipsRouter,
  // Identity checks through Authbase: Over 18 and verified seller (Build Board #47)
  identity: identityRouter,
  // Access gating engine core (Build Board #21), behind the accessGating feature flag
  access: accessRouter,
});

export type AppRouter = typeof mergedRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export default mergedRouter;
