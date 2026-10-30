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
import { usdcRouter } from "./usdc";
import { onrampRouter } from "./onramp";
import { contentRouter } from "./content";
import { notificationsRouter } from "./notifications";
import { identityRouter } from "./identity";
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
  // USDC in the wallet (Build Board #29): gasless send and USDC activity
  usdc: usdcRouter,
  // Buy USDC through Coinbase (Build Board #5)
  onramp: onrampRouter,
  content: contentRouter,
  // Account notification settings (RNS name reminders)
  notifications: notificationsRouter,
  // Identity checks through Authbase: Over 18 and verified seller (Build Board #47)
  identity: identityRouter,
});

export type AppRouter = typeof mergedRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export default mergedRouter;
