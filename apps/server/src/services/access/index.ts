/**
 * Access gating engine (Build Board #21). Import from here: registering the
 * resolvers is part of loading the module.
 */
import { registerResolver } from "./engine";
import { blockResolver } from "./resolvers/block";

registerResolver("block", blockResolver);

export {
  bumpViewer,
  check,
  checkBatch,
  eligibleUserIds,
  open,
  registerResolver,
  viewerKey,
} from "./engine";
export { createRule, deleteRule, listRules, loadRule, updateRule } from "./rules";
export type { Gate, Resolver, Viewer } from "./types";
