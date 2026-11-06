import { parseAbi } from "viem";

/**
 * AmpedPay admin surface (Build Board #50, docs/features/ampedpay.md 3.2): the reads, setters,
 * roles, pause and admin events of packages/contracts/src/AmpedPay.sol that the admin portal
 * uses, and the payments surface PAY-2 adds: pay, refund, the split and refund hashes and the
 * Paid, Share and Refunded events. Signatures must match the contract; the server tests decode
 * every call the portal and the relayer build.
 */
export const AMPEDPAY_ABI = parseAbi([
  // Reads
  "function paused() view returns (bool)",
  "function feeFloorBps() view returns (uint16)",
  "function minCreatorBps() view returns (uint16)",
  "function maxRecipients() view returns (uint8)",
  "function maxSplitValidity() view returns (uint32)",
  "function minPayment() view returns (uint256)",
  "function maxPayment() view returns (uint256)",
  "function treasury() view returns (address)",
  "function splitSigner() view returns (address)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getPayment(bytes32 paymentRef) view returns ((bytes32 splitHash, address payer, address creator, uint256 amount, uint256 platformAmount, bool refunded))",
  "function hashRefund(bytes32 paymentRef, uint64 deadline) view returns (bytes32)",
  // Payments, sent by the relayer (PAY-2)
  "function pay((bytes32 paymentRef, address payer, uint256 amount, (address to, uint16 bps, uint8 role)[] recipients, uint64 validBefore) split, bytes splitSig, uint256 authValidAfter, uint256 authValidBefore, bytes authSig) returns (bytes32 splitHash)",
  "function refund(bytes32 paymentRef, uint64 deadline, bytes creatorSig, uint256 permitDeadline, bytes permitSig)",
  // Admin writes, sent by the Safe or the pauser
  "function setFeeFloorBps(uint16 value)",
  "function setMinCreatorBps(uint16 value)",
  "function setMaxRecipients(uint8 value)",
  "function setMaxSplitValidity(uint32 value)",
  "function setMinPayment(uint256 value)",
  "function setMaxPayment(uint256 value)",
  "function setTreasury(address value)",
  "function setSplitSigner(address value)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function pause()",
  "function unpause()",
  // Admin events
  "event ParamChanged(bytes32 indexed name, uint256 oldValue, uint256 newValue)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  // Payment events (PAY-2)
  "event Paid(bytes32 indexed paymentRef, address indexed payer, address indexed creator, uint256 amount, bytes32 splitHash)",
  "event Share(bytes32 indexed paymentRef, address indexed to, uint8 role, uint256 amount)",
  "event Refunded(bytes32 indexed paymentRef, address indexed payer, address indexed creator, uint256 amount)",
  // Errors the setters raise
  "error OutOfRange(bytes32 name, uint256 value)",
  "error ZeroAddress()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error EnforcedPause()",
  "error ExpectedPause()",
  // Errors pay and refund raise
  "error SplitExpired()",
  "error SplitValidityTooLong()",
  "error InvalidSplitSignature()",
  "error PaymentRefUsed()",
  "error ZeroPaymentRef()",
  "error AmountOutOfRange(uint256 amount)",
  "error RecipientCount(uint256 count)",
  "error InvalidRecipient(uint256 index)",
  "error DuplicateRecipient(address to)",
  "error BpsSum(uint256 sum)",
  "error CreatorCount()",
  "error PlatformCount()",
  "error PromoterCount()",
  "error PlatformNotTreasury()",
  "error PlatformBps(uint16 bps)",
  "error CreatorBps(uint16 bps)",
  "error UnknownPayment()",
  "error AlreadyRefunded()",
  "error RefundExpired()",
  "error InvalidRefundSignature()",
]);
