/**
 * Access gating engine (Build Board #21). Import from here: registering the
 * resolvers is part of loading the module.
 */
import { registerPaymentVerifier, registerResolver } from "./engine";
import { blockResolver } from "./resolvers/block";
import { contentResolver } from "./resolvers/content";
import { usdcPaymentVerifier } from "./verifiers/usdc";

registerResolver("block", blockResolver);
registerResolver("content", contentResolver);
registerPaymentVerifier(usdcPaymentVerifier);

export {
  bumpViewer,
  check,
  checkBatch,
  eligibleUserIds,
  hexToId,
  idToHex,
  open,
  registerPaymentVerifier,
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
export type { Gate, PaidOffer, PaymentVerifier, PurchaseState, Resolver, Viewer } from "./types";
export { usdcPaymentVerifier } from "./verifiers/usdc";
export { viewerFrom } from "./viewer";
export { ACCESS_WRITE_MESSAGES, ownerAccess, ownerPoolId, resolveAccessInput } from "./write";
