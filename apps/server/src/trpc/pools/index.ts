import { router } from "../trpc";
import { poolsCreatorRouter } from "./creator";
import { poolsFanRouter } from "./fan";
import { poolsBlockEditorRouter } from "./blockEditor";
import { poolsListRouter } from "./list";

export const poolsRouter = router({
  creator: poolsCreatorRouter,
  fan: poolsFanRouter,
  blockEditor: poolsBlockEditorRouter,
  // Pool list paging (Build Board D7, PL2)
  list: poolsListRouter,
});
