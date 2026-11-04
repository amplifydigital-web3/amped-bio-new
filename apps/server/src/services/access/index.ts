/**
 * Access gating engine (Build Board #21). Import from here: registering the
 * resolvers is part of loading the module.
 */
import { registerResolver } from "./engine";
import { blockResolver } from "./resolvers/block";
import { contentResolver } from "./resolvers/content";

registerResolver("block", blockResolver);
registerResolver("content", contentResolver);

export {
  bumpViewer,
  check,
  checkBatch,
  eligibleUserIds,
  hexToId,
  idToHex,
  open,
  registerResolver,
  viewerKey,
} from "./engine";
export {
  cleanupInlineRule,
  createRule,
  deleteRule,
  forgetRules,
  listRules,
  loadRule,
  updateRule,
} from "./rules";
export {
  STAKE_NOT_ALLOWED_MESSAGE,
  assertStakeKindsAllowed,
  isStakeKind,
  stakeKindsAllowed,
} from "./allowlist";
export type { Gate, Resolver, Viewer } from "./types";
export { viewerFrom } from "./viewer";
