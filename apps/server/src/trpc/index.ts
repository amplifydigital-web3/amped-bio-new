import { router } from "./trpc";
import { userRouter } from "./user";
import { authRouter } from "./auth";
import appRouter from "./onelink";

// Merge all routers
const mergedRouter = router({
  onelink: appRouter,
  user: userRouter,
  auth: authRouter,
});

export type AppRouter = typeof mergedRouter;
export default mergedRouter;