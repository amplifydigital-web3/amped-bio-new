import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./handle";
import { adminRouter } from "./admin/index";
import { uploadRouter } from "./upload";
import { themeRouter } from "./theme";
import { themeGalleryRouter } from "./themeGallery";
import { walletRouter } from "./wallet";
import { blocksRouter } from "./blocks";
import { poolsRouter } from "./pools/index";
import { publicSettingsRouter } from "./publicSettings";
import { referralRouter } from "./referral";
import { inferRouterOutputs } from "@trpc/server";

// Merge all routers
const mergedRouter = router({
  handle: appRouter,
  user: userRouter,
  auth: authRouter,
  referral: referralRouter,
  admin: adminRouter,
  upload: uploadRouter,
  theme: themeRouter,
  themeGallery: themeGalleryRouter,
  wallet: walletRouter,
  blocks: blocksRouter,
  pools: poolsRouter,
  public: publicSettingsRouter,
});

export type AppRouter = typeof mergedRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export default mergedRouter;
