import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./onelink";
import { adminRouter } from "./admin/index";
import { uploadRouter } from "./upload";
import { themeRouter } from "./theme";
import { themeGalleryRouter } from "./themeGallery";

// Merge all routers
const mergedRouter = router({
  onelink: appRouter,
  user: userRouter,
  auth: authRouter,
  admin: adminRouter,
  upload: uploadRouter,
  theme: themeRouter,
  themeGallery: themeGalleryRouter,
});

export type AppRouter = typeof mergedRouter;
export default mergedRouter;
