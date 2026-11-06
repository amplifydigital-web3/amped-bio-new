import { parseAbi } from "viem";

/**
 * AmpedMemberships (PAY-3, docs/features/ampedmemberships.md 2) as MB-1 calls it: join,
 * renew, cancel with a signature, end by the platform, the reads the renewal job needs, and
 * the Joined, Charged, Share and Canceled events. Signatures must match the contract.
 */
export const AMPEDMEMBERSHIPS_ABI = parseAbi([
  "function paused() view returns (bool)",
  "function renewGrace() view returns (uint32)",
  "function treasury() view returns (address)",
  "function getSubscription(bytes32 subscriptionRef) view returns ((bytes32 planRef, bytes32 joinHash, address member, address creator, uint256 price, uint32 periodSeconds, uint32 charges, uint64 nextDue, bool active))",
  "function isRenewable(bytes32 subscriptionRef) view returns (bool)",
  "function hashJoin((bytes32 subscriptionRef, bytes32 planRef, address member, uint256 price, uint32 periodSeconds, (address to, uint16 bps, uint8 role)[] recipients, uint64 validBefore) t) view returns (bytes32)",
  "function join((bytes32 subscriptionRef, bytes32 planRef, address member, uint256 price, uint32 periodSeconds, (address to, uint16 bps, uint8 role)[] recipients, uint64 validBefore) t, bytes splitSig, bytes memberSig, uint256 permitValue, uint256 permitDeadline, bytes permitSig) returns (bytes32 joinHash)",
  "function renew(bytes32 subscriptionRef)",
  "function cancelWithSignature(bytes32 subscriptionRef, uint64 deadline, bytes memberSig)",
  "function endByPlatform(bytes32 subscriptionRef)",
  "event Joined(bytes32 indexed subscriptionRef, bytes32 indexed planRef, address indexed member, address creator, uint256 price, uint32 periodSeconds, uint64 nextDue, bytes32 joinHash)",
  "event Charged(bytes32 indexed subscriptionRef, address indexed member, uint256 amount, uint32 charge, uint64 nextDue)",
  "event Share(bytes32 indexed subscriptionRef, address indexed to, uint8 role, uint256 amount)",
  "event Canceled(bytes32 indexed subscriptionRef, address indexed member, uint8 endedBy)",
  "error JoinExpired()",
  "error JoinValidityTooLong()",
  "error InvalidSplitSignature()",
  "error InvalidMemberSignature()",
  "error SubscriptionRefUsed()",
  "error PriceOutOfRange(uint256 price)",
  "error PeriodOutOfRange(uint32 periodSeconds)",
  "error NotActive()",
  "error NotDue(uint64 nextDue)",
  "error Lapsed(uint64 nextDue)",
  "error CancelExpired()",
  "error InvalidCancelSignature()",
]);
