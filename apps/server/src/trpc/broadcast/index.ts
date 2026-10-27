import { router } from "../trpc";
import { broadcastCreatorRouter } from "./creator";
import { broadcastInboxRouter } from "./inbox";

// Creator Pool Broadcast (Build Board #1), phase 1
export const broadcastRouter = router({
  creator: broadcastCreatorRouter,
  inbox: broadcastInboxRouter,
});
