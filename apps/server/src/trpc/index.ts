import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./onelink";
import { adminRouter } from "./admin";
import { uploadRouter } from "./upload";
import { themeRouter } from "./theme";

// Merge all routers
const mergedRouter = router({
  onelink: appRouter,
  user: userRouter,
  auth: authRouter,
  admin: adminRouter,
  upload: uploadRouter,
  theme: themeRouter,
});

export type AppRouter = typeof mergedRouter;
export default mergedRouter;