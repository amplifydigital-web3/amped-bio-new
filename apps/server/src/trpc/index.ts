import { router } from "./trpc";
import { userRouter } from "./user";
import appRouter from "./onelink";

// Merge all routers
const mergedRouter = router({
  onelink: appRouter,
  user: userRouter,
});

export type AppRouter = typeof mergedRouter;
export default mergedRouter;