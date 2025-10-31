import { router } from "../trpc";
import { poolsCreatorRouter } from "./creator";
import { poolsFanRouter } from "./fan";

export const poolsRouter = router({
  creator: poolsCreatorRouter,
  fan: poolsFanRouter,
});
