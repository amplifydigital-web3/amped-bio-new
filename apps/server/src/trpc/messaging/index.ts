import { router } from "../trpc";
import { messagingCreatorRouter } from "./creator";
import { messagingFanRouter } from "./fan";

/** Messaging on Telegram (Build Board #2), phase 1: fan to creator messages. */
export const messagingRouter = router({
  creator: messagingCreatorRouter,
  fan: messagingFanRouter,
});
