// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice USDC (Circle FiatToken v2.2) permit with a bytes signature, which accepts both EOA
/// and ERC-1271 smart wallet signatures.
interface IUSDCPermit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, bytes memory signature) external;
}

/// @title AmpedMemberships
/// @notice Memberships on Base. At join the fan signs the membership terms and a USDC permit to
/// this contract. The contract pulls one period at join, then the relayer renews one period at a
/// time on the due date, paying the recipients stored at join. Cancel stops every later charge.
/// Spec: memberships spec 3.4 (Build Board #25) as amended on 2 Nov, content spec 3.9 (the split
/// is signed once at join and stored with the subscription), docs/features/ampedmemberships.md.
/// @dev Non custodial: every share moves straight from the member to its recipient with
/// transferFrom; the contract never holds USDC. Every adjustable value has a fixed range, so no
/// role can set a value outside it. Same roles, pause and parameter events as AmpedPay.
/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract AmpedMemberships is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- roles

    /// @notice Changes the numeric limits. Held by the environment's Safe.
    bytes32 public constant PARAMS_ROLE = keccak256("PARAMS_ROLE");
    /// @notice Pauses joins and renewals. Held by the Safe and the Coinbase pauser account.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    /// @notice Submits joins, renewals and signed cancels. Held by the Coinbase relayer account.
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // ------------------------------------------------------------ constants

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint16 public constant MIN_CREATOR_BPS_FLOOR = 5_000;
    uint8 public constant MIN_RECIPIENTS = 2;
    uint8 public constant MAX_RECIPIENTS_CAP = 8;
    uint32 public constant MIN_JOIN_VALIDITY = 60;
    uint32 public constant MAX_JOIN_VALIDITY_CAP = 86_400;
    /// @notice Shortest and longest billing period. "Every 30 days" and yearly sit inside.
    uint32 public constant MIN_PERIOD = 1 days;
    uint32 public constant MAX_PERIOD = 366 days;
    /// @notice A renewal this close after the due date keeps the schedule. A later one, inside
    /// the grace, starts a full period from the renewal (amendment 1, 3.5: no charge for grace days).
    uint32 public constant ON_TIME_WINDOW = 1 days;
    uint32 public constant MIN_RENEW_GRACE = 1 days;
    uint32 public constant MAX_RENEW_GRACE = 30 days;
    /// @notice 0.01 USDC.
    uint256 public constant MIN_PRICE_FLOOR = 10_000;
    /// @notice 10,000 USDC per period.
    uint256 public constant MAX_PRICE_CAP = 10_000e6;

    uint8 public constant ROLE_CREATOR = 0;
    uint8 public constant ROLE_PLATFORM = 1;
    uint8 public constant ROLE_PROMOTER = 2;
    uint8 public constant ROLE_PARTNER = 3;

    bytes32 public constant RECIPIENT_TYPEHASH = keccak256("Recipient(address to,uint16 bps,uint8 role)");
    bytes32 public constant JOIN_TYPEHASH = keccak256(
        "JoinTable(bytes32 subscriptionRef,bytes32 planRef,address member,uint256 price,uint32 periodSeconds,Recipient[] recipients,uint64 validBefore)Recipient(address to,uint16 bps,uint8 role)"
    );
    bytes32 public constant CANCEL_TYPEHASH = keccak256("Cancel(bytes32 subscriptionRef,uint64 deadline)");

    /// @notice Why a subscription ended, in Canceled.
    uint8 public constant END_BY_MEMBER = 0;
    uint8 public constant END_BY_MEMBER_SIGNATURE = 1;
    uint8 public constant END_BY_PLATFORM = 2;

    /// @notice USDC on this chain. Fixed at deploy.
    IERC20 public immutable usdc;

    // -------------------------------------------------------------- types

    struct Recipient {
        address to;
        uint16 bps;
        uint8 role;
    }

    /// @notice The membership terms. The split signer and the member both sign its EIP-712 hash.
    struct JoinTable {
        bytes32 subscriptionRef;
        bytes32 planRef;
        address member;
        uint256 price;
        uint32 periodSeconds;
        Recipient[] recipients;
        uint64 validBefore;
    }

    struct Subscription {
        bytes32 planRef;
        bytes32 joinHash;
        address member;
        address creator;
        uint256 price;
        uint32 periodSeconds;
        uint32 charges;
        uint64 nextDue;
        bool active;
    }

    // ------------------------------------------------------------ storage

    uint16 public feeFloorBps;
    uint16 public minCreatorBps;
    uint8 public maxRecipients;
    uint32 public maxJoinValidity;
    uint32 public renewGrace;
    uint256 public minPrice;
    uint256 public maxPrice;
    address public treasury;
    address public splitSigner;

    mapping(bytes32 subscriptionRef => Subscription) private _subs;
    mapping(bytes32 subscriptionRef => Recipient[]) private _recipients;

    // ------------------------------------------------------------- events

    event Joined(
        bytes32 indexed subscriptionRef,
        bytes32 indexed planRef,
        address indexed member,
        address creator,
        uint256 price,
        uint32 periodSeconds,
        uint64 nextDue,
        bytes32 joinHash
    );
    /// @notice One period paid, at join (charge 1) and at each renewal.
    event Charged(
        bytes32 indexed subscriptionRef, address indexed member, uint256 amount, uint32 charge, uint64 nextDue
    );
    event Share(bytes32 indexed subscriptionRef, address indexed to, uint8 role, uint256 amount);
    event Canceled(bytes32 indexed subscriptionRef, address indexed member, uint8 endedBy);
    /// @notice Every adjustable value emits this on change. Addresses are cast to uint256.
    event ParamChanged(bytes32 indexed name, uint256 oldValue, uint256 newValue);

    // ------------------------------------------------------------- errors

    error ZeroAddress();
    error OutOfRange(bytes32 name, uint256 value);
    error JoinExpired();
    error JoinValidityTooLong();
    error InvalidSplitSignature();
    error InvalidMemberSignature();
    error SubscriptionRefUsed();
    error ZeroSubscriptionRef();
    error PriceOutOfRange(uint256 price);
    error PeriodOutOfRange(uint32 periodSeconds);
    error RecipientCount(uint256 count);
    error InvalidRecipient(uint256 index);
    error DuplicateRecipient(address to);
    error MemberIsRecipient();
    error BpsSum(uint256 sum);
    error CreatorCount();
    error PlatformCount();
    error PromoterCount();
    error PlatformNotTreasury();
    error PlatformBps(uint16 bps);
    error CreatorBps(uint16 bps);
    error UnknownSubscription();
    error NotActive();
    error NotDue(uint64 nextDue);
    error Lapsed(uint64 nextDue);
    error NotMember();
    error CancelExpired();
    error InvalidCancelSignature();

    // ---------------------------------------------------- init and setup

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        _disableInitializers();
    }

    /// @param admin The environment's Safe. Gets DEFAULT_ADMIN_ROLE, PARAMS_ROLE and PAUSER_ROLE.
    /// @param treasury_ Receives the platform share. The Safe in both environments.
    /// @param splitSigner_ The Coinbase account that signs split tables (the same as AmpedPay's).
    /// @param relayer The Coinbase relayer account.
    /// @param pauser The Coinbase pauser account. May be zero to grant later.
    function initialize(address admin, address treasury_, address splitSigner_, address relayer, address pauser)
        external
        initializer
    {
        if (admin == address(0) || treasury_ == address(0) || splitSigner_ == address(0) || relayer == address(0)) {
            revert ZeroAddress();
        }
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("AmpedMemberships", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMS_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
        if (pauser != address(0)) _grantRole(PAUSER_ROLE, pauser);

        treasury = treasury_;
        splitSigner = splitSigner_;
        feeFloorBps = 500;
        minCreatorBps = 5_000;
        maxRecipients = 6;
        maxJoinValidity = 3_600;
        renewGrace = 7 days;
        minPrice = 1e6;
        maxPrice = 5_000e6;
    }

    // ------------------------------------------------------------ members

    /// @notice Starts a membership and pulls the first period.
    /// @param t The membership terms the API built.
    /// @param splitSig The split signer's signature over the join hash.
    /// @param memberSig The member's signature over the same join hash: their consent to the
    /// price, the period and the recipients (recurring consent on chain).
    /// @param permitValue The allowance the member's permit sets (the spec asks for 12 periods
    /// on every 30 days and 2 on yearly). Ignored when permitSig is empty.
    /// @param permitDeadline The permit's deadline. Ignored when permitSig is empty.
    /// @param permitSig The member's USDC permit to this contract, or empty when the allowance
    /// already covers the first period.
    function join(
        JoinTable calldata t,
        bytes calldata splitSig,
        bytes calldata memberSig,
        uint256 permitValue,
        uint256 permitDeadline,
        bytes calldata permitSig
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant returns (bytes32 joinHash) {
        if (block.timestamp > t.validBefore) revert JoinExpired();
        if (t.validBefore - block.timestamp > maxJoinValidity) revert JoinValidityTooLong();
        if (t.subscriptionRef == bytes32(0)) revert ZeroSubscriptionRef();
        if (_subs[t.subscriptionRef].member != address(0)) revert SubscriptionRefUsed();
        if (t.member == address(0)) revert ZeroAddress();
        if (t.price < minPrice || t.price > maxPrice) revert PriceOutOfRange(t.price);
        if (t.periodSeconds < MIN_PERIOD || t.periodSeconds > MAX_PERIOD) revert PeriodOutOfRange(t.periodSeconds);

        joinHash = hashJoin(t);
        if (!SignatureChecker.isValidSignatureNow(splitSigner, joinHash, splitSig)) revert InvalidSplitSignature();
        if (!SignatureChecker.isValidSignatureNow(t.member, joinHash, memberSig)) revert InvalidMemberSignature();

        // Effects first. The ref is taken before any external call.
        Subscription storage s = _store(t, joinHash);

        if (permitSig.length != 0) {
            // A front run permit leaves the allowance in place, so a failure here is not fatal:
            // the pull below decides.
            try IUSDCPermit(address(usdc)).permit(t.member, address(this), permitValue, permitDeadline, permitSig) {}
                catch {}
        }

        _charge(t.subscriptionRef, s, 1, s.nextDue);
    }

    /// @notice Pulls one period on or after the due date, inside the renewal grace. The keeper
    /// (relayer) calls it; it reverts when the allowance or balance is short, and the server
    /// records the membership as past due.
    function renew(bytes32 subscriptionRef) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        Subscription storage s = _subs[subscriptionRef];
        if (s.member == address(0)) revert UnknownSubscription();
        if (!s.active) revert NotActive();
        if (block.timestamp < s.nextDue) revert NotDue(s.nextDue);
        if (block.timestamp > uint256(s.nextDue) + renewGrace) revert Lapsed(s.nextDue);

        // On time keeps the schedule. Late, inside the grace, starts a full period now: the
        // member is never charged for the grace days.
        uint64 nextDue = block.timestamp <= uint256(s.nextDue) + ON_TIME_WINDOW
            ? s.nextDue + s.periodSeconds
            : uint64(block.timestamp) + s.periodSeconds;
        s.nextDue = nextDue;
        uint32 charge = s.charges + 1;
        s.charges = charge;
        _charge(subscriptionRef, s, charge, nextDue);
    }

    /// @notice The member ends their own membership. Works while paused.
    function cancel(bytes32 subscriptionRef) external {
        Subscription storage s = _subs[subscriptionRef];
        if (s.member == address(0)) revert UnknownSubscription();
        if (msg.sender != s.member) revert NotMember();
        _end(subscriptionRef, s, END_BY_MEMBER);
    }

    /// @notice The relayer submits the member's signed Cancel, so the member needs no ETH.
    /// Works while paused: a member can always stop the charges.
    function cancelWithSignature(bytes32 subscriptionRef, uint64 deadline, bytes calldata memberSig)
        external
        onlyRole(RELAYER_ROLE)
    {
        Subscription storage s = _subs[subscriptionRef];
        if (s.member == address(0)) revert UnknownSubscription();
        if (block.timestamp > deadline) revert CancelExpired();
        if (!SignatureChecker.isValidSignatureNow(s.member, hashCancel(subscriptionRef, deadline), memberSig)) {
            revert InvalidCancelSignature();
        }
        _end(subscriptionRef, s, END_BY_MEMBER_SIGNATURE);
    }

    /// @notice The platform ends a membership: plan removed, seller pass lapsed past the
    /// member's period, account deleted, or past due beyond the grace. Ending only stops later
    /// charges, so it never needs the member. Works while paused.
    function endByPlatform(bytes32 subscriptionRef) external onlyRole(RELAYER_ROLE) {
        Subscription storage s = _subs[subscriptionRef];
        if (s.member == address(0)) revert UnknownSubscription();
        _end(subscriptionRef, s, END_BY_PLATFORM);
    }

    // -------------------------------------------------------------- views

    /// @notice The EIP-712 digest of a join table. The split signer and the member sign it.
    function hashJoin(JoinTable calldata t) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](t.recipients.length);
        for (uint256 i; i < t.recipients.length; ++i) {
            Recipient calldata r = t.recipients[i];
            hashes[i] = keccak256(abi.encode(RECIPIENT_TYPEHASH, r.to, r.bps, r.role));
        }
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    JOIN_TYPEHASH,
                    t.subscriptionRef,
                    t.planRef,
                    t.member,
                    t.price,
                    t.periodSeconds,
                    keccak256(abi.encodePacked(hashes)),
                    t.validBefore
                )
            )
        );
    }

    /// @notice The EIP-712 digest a member signs to cancel.
    function hashCancel(bytes32 subscriptionRef, uint64 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CANCEL_TYPEHASH, subscriptionRef, deadline)));
    }

    function getSubscription(bytes32 subscriptionRef) external view returns (Subscription memory) {
        return _subs[subscriptionRef];
    }

    function getRecipients(bytes32 subscriptionRef) external view returns (Recipient[] memory) {
        return _recipients[subscriptionRef];
    }

    /// @notice True when a renewal would be accepted now (active, due and inside the grace).
    /// Says nothing about the member's allowance or balance.
    function isRenewable(bytes32 subscriptionRef) external view returns (bool) {
        Subscription storage s = _subs[subscriptionRef];
        return s.active && block.timestamp >= s.nextDue && block.timestamp <= uint256(s.nextDue) + renewGrace;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------- admin: pause

    /// @notice Stops joins and renewals. Cancels still work.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume is deliberate: only the Safe.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------ admin: limits

    function setFeeFloorBps(uint16 value) external onlyRole(PARAMS_ROLE) {
        if (value > MAX_FEE_BPS || uint256(value) + minCreatorBps > BPS) revert OutOfRange("feeFloorBps", value);
        emit ParamChanged("feeFloorBps", feeFloorBps, value);
        feeFloorBps = value;
    }

    function setMinCreatorBps(uint16 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_CREATOR_BPS_FLOOR || value > BPS || uint256(value) + feeFloorBps > BPS) {
            revert OutOfRange("minCreatorBps", value);
        }
        emit ParamChanged("minCreatorBps", minCreatorBps, value);
        minCreatorBps = value;
    }

    function setMaxRecipients(uint8 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_RECIPIENTS || value > MAX_RECIPIENTS_CAP) revert OutOfRange("maxRecipients", value);
        emit ParamChanged("maxRecipients", maxRecipients, value);
        maxRecipients = value;
    }

    function setMaxJoinValidity(uint32 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_JOIN_VALIDITY || value > MAX_JOIN_VALIDITY_CAP) revert OutOfRange("maxJoinValidity", value);
        emit ParamChanged("maxJoinValidity", maxJoinValidity, value);
        maxJoinValidity = value;
    }

    function setRenewGrace(uint32 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_RENEW_GRACE || value > MAX_RENEW_GRACE) revert OutOfRange("renewGrace", value);
        emit ParamChanged("renewGrace", renewGrace, value);
        renewGrace = value;
    }

    function setMinPrice(uint256 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_PRICE_FLOOR || value > maxPrice) revert OutOfRange("minPrice", value);
        emit ParamChanged("minPrice", minPrice, value);
        minPrice = value;
    }

    function setMaxPrice(uint256 value) external onlyRole(PARAMS_ROLE) {
        if (value < minPrice || value > MAX_PRICE_CAP) revert OutOfRange("maxPrice", value);
        emit ParamChanged("maxPrice", maxPrice, value);
        maxPrice = value;
    }

    // ------------------------------------------------- admin: addresses

    /// @notice New renewals pay the platform share to the new treasury.
    function setTreasury(address value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (value == address(0)) revert ZeroAddress();
        emit ParamChanged("treasury", uint256(uint160(treasury)), uint256(uint160(value)));
        treasury = value;
    }

    function setSplitSigner(address value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (value == address(0)) revert ZeroAddress();
        emit ParamChanged("splitSigner", uint256(uint160(splitSigner)), uint256(uint160(value)));
        splitSigner = value;
    }

    // ------------------------------------------------------------ internal

    /// @dev Checks the recipients and records the subscription with its first period paid.
    function _store(JoinTable calldata t, bytes32 joinHash) internal returns (Subscription storage s) {
        (address creator,) = _validateRecipients(t.recipients, t.member);
        s = _subs[t.subscriptionRef];
        s.planRef = t.planRef;
        s.joinHash = joinHash;
        s.member = t.member;
        s.creator = creator;
        s.price = t.price;
        s.periodSeconds = t.periodSeconds;
        s.charges = 1;
        s.nextDue = uint64(block.timestamp) + t.periodSeconds;
        s.active = true;
        Recipient[] storage stored = _recipients[t.subscriptionRef];
        for (uint256 i; i < t.recipients.length; ++i) {
            stored.push(t.recipients[i]);
        }
        emit Joined(t.subscriptionRef, t.planRef, t.member, creator, t.price, t.periodSeconds, s.nextDue, joinHash);
    }

    function _end(bytes32 subscriptionRef, Subscription storage s, uint8 endedBy) internal {
        if (!s.active) revert NotActive();
        s.active = false;
        emit Canceled(subscriptionRef, s.member, endedBy);
    }

    /// @dev Pays every non creator share, then the creator the remainder, each straight from the
    /// member. The platform share goes to the current treasury.
    function _charge(bytes32 subscriptionRef, Subscription storage s, uint32 charge, uint64 nextDue) internal {
        address member = s.member;
        uint256 price = s.price;
        Recipient[] storage rs = _recipients[subscriptionRef];
        uint256 paidOut;
        address creator;
        for (uint256 i; i < rs.length; ++i) {
            Recipient storage r = rs[i];
            if (r.role == ROLE_CREATOR) {
                creator = r.to;
                continue;
            }
            uint256 share = (price * r.bps) / BPS;
            address to = r.role == ROLE_PLATFORM ? treasury : r.to;
            paidOut += share;
            if (share != 0) usdc.safeTransferFrom(member, to, share);
            emit Share(subscriptionRef, to, r.role, share);
        }
        uint256 creatorShare = price - paidOut;
        usdc.safeTransferFrom(member, creator, creatorShare);
        emit Share(subscriptionRef, creator, ROLE_CREATOR, creatorShare);
        emit Charged(subscriptionRef, member, price, charge, nextDue);
    }

    /// @dev Every recipient rule AmpedPay enforces, plus: the member is never a recipient.
    function _validateRecipients(Recipient[] calldata rs, address member)
        internal
        view
        returns (address creator, uint256 creatorIndex)
    {
        uint256 n = rs.length;
        if (n < MIN_RECIPIENTS || n > maxRecipients) revert RecipientCount(n);

        uint256 sum;
        uint256 creators;
        uint256 platforms;
        uint256 promoters;
        for (uint256 i; i < n; ++i) {
            Recipient calldata r = rs[i];
            if (r.to == address(0) || r.bps == 0 || r.role > ROLE_PARTNER) revert InvalidRecipient(i);
            if (r.to == member) revert MemberIsRecipient();
            for (uint256 j; j < i; ++j) {
                if (rs[j].to == r.to) revert DuplicateRecipient(r.to);
            }
            sum += r.bps;
            if (r.role == ROLE_CREATOR) {
                creators++;
                creator = r.to;
                creatorIndex = i;
                if (r.bps < minCreatorBps) revert CreatorBps(r.bps);
            } else if (r.role == ROLE_PLATFORM) {
                platforms++;
                if (r.to != treasury) revert PlatformNotTreasury();
                if (r.bps < feeFloorBps || r.bps > MAX_FEE_BPS) revert PlatformBps(r.bps);
            } else if (r.role == ROLE_PROMOTER) {
                promoters++;
            }
        }
        if (creators != 1) revert CreatorCount();
        if (platforms != 1) revert PlatformCount();
        if (promoters > 1) revert PromoterCount();
        if (sum != BPS) revert BpsSum(sum);
    }
}
