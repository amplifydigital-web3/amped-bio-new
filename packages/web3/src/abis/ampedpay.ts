import { parseAbi } from "viem";

/**
 * AmpedPay admin surface (Build Board #50, docs/features/ampedpay.md 3.2): the reads, setters,
 * roles, pause and admin events of packages/contracts/src/AmpedPay.sol that the admin portal
 * uses. PAY-2 adds pay, refund and their events. Signatures must match the contract; the
 * server tests decode every call the portal builds.
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
  // Errors the setters raise
  "error OutOfRange(bytes32 name, uint256 value)",
  "error ZeroAddress()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error EnforcedPause()",
  "error ExpectedPause()",
]);
