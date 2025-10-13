import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./onelink";
import { adminRouter } from "./admin/index";
import { uploadRouter } from "./upload";
import { themeRouter } from "./theme";
import { themeGalleryRouter } from "./themeGallery";
import { walletRouter } from "./wallet";
import { blocksRouter } from "./blocks";
import { publicSettingsRouter } from "./publicSettings";
import { inferRouterOutputs } from "@trpc/server";

// Merge all routers
const mergedRouter = router({
  onelink: appRouter,
  user: userRouter,
  auth: authRouter,
  admin: adminRouter,
  upload: uploadRouter,
  theme: themeRouter,
  themeGallery: themeGalleryRouter,
  wallet: walletRouter,
  blocks: blocksRouter,
  public: publicSettingsRouter,
});

export type AppRouter = typeof mergedRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export default mergedRouter;
