import { router } from "../trpc";
import { poolsCreatorRouter } from "./creator";
import { poolsFanRouter } from "./fan";
import { poolsBlockEditorRouter } from "./blockEditor";

export const poolsRouter = router({
  creator: poolsCreatorRouter,
  fan: poolsFanRouter,
  blockEditor: poolsBlockEditorRouter,
});
