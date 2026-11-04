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

/// @notice USDC (Circle FiatToken v2.2) functions AmpedPay calls. The bytes signature
/// variants accept both EOA and ERC-1271 smart wallet signatures.
interface IUSDCAuthorization {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;

    function permit(address owner, address spender, uint256 value, uint256 deadline, bytes memory signature) external;
}

/// @title AmpedPay
/// @notice One time payments on Base. A fan signs one USDC receiveWithAuthorization. The
/// contract pays every recipient of a split table the Amped.Bio API signed, in one transaction.
/// Spec: docs/features/ampedpay.md (Build Board #50).
/// @dev The fan's authorization nonce must equal the EIP-712 hash of the split table
/// (spec 2.3, decision 7). USDC refuses the authorization if the relayer pairs it with
/// any other split. Every adjustable value has a fixed range below, so no role can set a
/// value outside it (spec 3.2, acceptance 3).
/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract AmpedPay is
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
    /// @notice Pauses payments. Held by the Safe and the Coinbase pauser account.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    /// @notice Submits payments and refunds. Held by the Coinbase relayer account.
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // ------------------------------------------------------------ constants

    uint16 public constant BPS = 10_000;
    /// @notice The platform share can never exceed 10% (decision 6).
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint16 public constant MIN_CREATOR_BPS_FLOOR = 5_000;
    uint8 public constant MIN_RECIPIENTS = 2;
    uint8 public constant MAX_RECIPIENTS_CAP = 8;
    uint32 public constant MIN_SPLIT_VALIDITY = 60;
    uint32 public constant MAX_SPLIT_VALIDITY_CAP = 86_400;
    /// @notice 0.01 USDC.
    uint256 public constant MIN_PAYMENT_FLOOR = 10_000;
    /// @notice 100,000 USDC.
    uint256 public constant MAX_PAYMENT_CAP = 100_000e6;

    uint8 public constant ROLE_CREATOR = 0;
    uint8 public constant ROLE_PLATFORM = 1;
    uint8 public constant ROLE_PROMOTER = 2;
    uint8 public constant ROLE_PARTNER = 3;

    bytes32 public constant RECIPIENT_TYPEHASH = keccak256("Recipient(address to,uint16 bps,uint8 role)");
    bytes32 public constant SPLIT_TYPEHASH = keccak256(
        "SplitTable(bytes32 paymentRef,address payer,uint256 amount,Recipient[] recipients,uint64 validBefore)Recipient(address to,uint16 bps,uint8 role)"
    );
    bytes32 public constant REFUND_TYPEHASH = keccak256("Refund(bytes32 paymentRef,uint64 deadline)");

    /// @notice USDC on this chain. Fixed at deploy (spec 3.2 constants).
    IERC20 public immutable usdc;

    // -------------------------------------------------------------- types

    struct Recipient {
        address to;
        uint16 bps;
        uint8 role;
    }

    struct SplitTable {
        bytes32 paymentRef;
        address payer;
        uint256 amount;
        Recipient[] recipients;
        uint64 validBefore;
    }

    struct Payment {
        bytes32 splitHash;
        address payer;
        address creator;
        uint256 amount;
        uint256 platformAmount;
        bool refunded;
    }

    // ------------------------------------------------------------ storage

    uint16 public feeFloorBps;
    uint16 public minCreatorBps;
    uint8 public maxRecipients;
    uint32 public maxSplitValidity;
    uint256 public minPayment;
    uint256 public maxPayment;
    address public treasury;
    address public splitSigner;

    mapping(bytes32 paymentRef => Payment) private _payments;

    // ------------------------------------------------------------- events

    event Paid(
        bytes32 indexed paymentRef, address indexed payer, address indexed creator, uint256 amount, bytes32 splitHash
    );
    event Share(bytes32 indexed paymentRef, address indexed to, uint8 role, uint256 amount);
    event Refunded(bytes32 indexed paymentRef, address indexed payer, address indexed creator, uint256 amount);
    /// @notice Every adjustable value emits this on change. Addresses are cast to uint256.
    event ParamChanged(bytes32 indexed name, uint256 oldValue, uint256 newValue);

    // ------------------------------------------------------------- errors

    error ZeroAddress();
    error OutOfRange(bytes32 name, uint256 value);
    error SplitExpired();
    error SplitValidityTooLong();
    error InvalidSplitSignature();
    error PaymentRefUsed();
    error ZeroPaymentRef();
    error AmountOutOfRange(uint256 amount);
    error RecipientCount(uint256 count);
    error InvalidRecipient(uint256 index);
    error DuplicateRecipient(address to);
    error BpsSum(uint256 sum);
    error CreatorCount();
    error PlatformCount();
    error PromoterCount();
    error PlatformNotTreasury();
    error PlatformBps(uint16 bps);
    error CreatorBps(uint16 bps);
    error UnknownPayment();
    error AlreadyRefunded();
    error RefundExpired();
    error InvalidRefundSignature();

    // ---------------------------------------------------- init and setup

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        _disableInitializers();
    }

    /// @param admin The environment's Safe. Gets DEFAULT_ADMIN_ROLE, PARAMS_ROLE and PAUSER_ROLE.
    /// @param treasury_ Receives the platform share. The Safe in both environments (decision 3).
    /// @param splitSigner_ The Coinbase account that signs split tables.
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
        __EIP712_init("AmpedPay", "1");

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
        maxSplitValidity = 3_600;
        minPayment = 500_000;
        maxPayment = 1_000e6;
    }

    // ------------------------------------------------------------ payments

    /// @notice Takes the payer's USDC and pays every recipient of the signed split.
    /// @param split The split table the API signed.
    /// @param splitSig The split signer's signature over the split table.
    /// @param authValidAfter The payer's authorization validAfter.
    /// @param authValidBefore The payer's authorization validBefore.
    /// @param authSig The payer's ReceiveWithAuthorization signature. Its nonce is the split hash.
    function pay(
        SplitTable calldata split,
        bytes calldata splitSig,
        uint256 authValidAfter,
        uint256 authValidBefore,
        bytes calldata authSig
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant returns (bytes32 splitHash) {
        if (block.timestamp > split.validBefore) revert SplitExpired();
        if (split.validBefore - block.timestamp > maxSplitValidity) revert SplitValidityTooLong();
        if (split.paymentRef == bytes32(0)) revert ZeroPaymentRef();
        if (_payments[split.paymentRef].payer != address(0)) revert PaymentRefUsed();
        if (split.payer == address(0)) revert ZeroAddress();
        if (split.amount < minPayment || split.amount > maxPayment) revert AmountOutOfRange(split.amount);

        splitHash = hashSplit(split);
        if (!SignatureChecker.isValidSignatureNow(splitSigner, splitHash, splitSig)) revert InvalidSplitSignature();

        (address creator, uint256 creatorIndex) = _validateRecipients(split.recipients);

        // Effects first. The payment ref is taken before any external call.
        Payment storage p = _payments[split.paymentRef];
        p.splitHash = splitHash;
        p.payer = split.payer;
        p.creator = creator;
        p.amount = split.amount;

        // The nonce is the split hash: an authorization signed for another split fails here.
        IUSDCAuthorization(address(usdc))
            .receiveWithAuthorization(
                split.payer, address(this), split.amount, authValidAfter, authValidBefore, splitHash, authSig
            );

        emit Paid(split.paymentRef, split.payer, creator, split.amount, splitHash);
        p.platformAmount = _distribute(split.paymentRef, split.amount, split.recipients, creatorIndex);
    }

    /// @notice Refunds the full amount to the payer. The creator funds the creator, promoter and
    /// partner shares; the treasury funds the platform share (content spec decision 25).
    /// @param paymentRef The payment to refund.
    /// @param deadline Last second the creator's refund signature is valid.
    /// @param creatorSig The creator's Refund signature.
    /// @param permitDeadline Deadline of the creator's USDC permit. Ignored when permitSig is empty.
    /// @param permitSig The creator's USDC permit for the creator funded amount, or empty if an
    /// allowance already exists.
    function refund(
        bytes32 paymentRef,
        uint64 deadline,
        bytes calldata creatorSig,
        uint256 permitDeadline,
        bytes calldata permitSig
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        Payment storage p = _payments[paymentRef];
        if (p.payer == address(0)) revert UnknownPayment();
        if (p.refunded) revert AlreadyRefunded();
        if (block.timestamp > deadline) revert RefundExpired();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, paymentRef, deadline)));
        if (!SignatureChecker.isValidSignatureNow(p.creator, digest, creatorSig)) revert InvalidRefundSignature();

        p.refunded = true;
        uint256 creatorFunded = p.amount - p.platformAmount;

        if (permitSig.length != 0) {
            // A front-run permit leaves the allowance in place, so a failure here is not fatal.
            try IUSDCAuthorization(address(usdc))
                .permit(p.creator, address(this), creatorFunded, permitDeadline, permitSig) {}
                catch {}
        }
        usdc.safeTransferFrom(p.creator, p.payer, creatorFunded);
        if (p.platformAmount != 0) usdc.safeTransferFrom(treasury, p.payer, p.platformAmount);

        emit Refunded(paymentRef, p.payer, p.creator, p.amount);
    }

    // -------------------------------------------------------------- views

    /// @notice The EIP-712 digest of a split table. The split signer signs it and the payer's
    /// authorization uses it as its nonce.
    function hashSplit(SplitTable calldata split) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](split.recipients.length);
        for (uint256 i; i < split.recipients.length; ++i) {
            Recipient calldata r = split.recipients[i];
            hashes[i] = keccak256(abi.encode(RECIPIENT_TYPEHASH, r.to, r.bps, r.role));
        }
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SPLIT_TYPEHASH,
                    split.paymentRef,
                    split.payer,
                    split.amount,
                    keccak256(abi.encodePacked(hashes)),
                    split.validBefore
                )
            )
        );
    }

    /// @notice The EIP-712 digest a creator signs to refund a payment.
    function hashRefund(bytes32 paymentRef, uint64 deadline) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, paymentRef, deadline)));
    }

    function getPayment(bytes32 paymentRef) external view returns (Payment memory) {
        return _payments[paymentRef];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------- admin: pause

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume is deliberate: only the Safe (spec 3.5, decision 2).
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

    function setMaxSplitValidity(uint32 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_SPLIT_VALIDITY || value > MAX_SPLIT_VALIDITY_CAP) revert OutOfRange("maxSplitValidity", value);
        emit ParamChanged("maxSplitValidity", maxSplitValidity, value);
        maxSplitValidity = value;
    }

    function setMinPayment(uint256 value) external onlyRole(PARAMS_ROLE) {
        if (value < MIN_PAYMENT_FLOOR || value > maxPayment) revert OutOfRange("minPayment", value);
        emit ParamChanged("minPayment", minPayment, value);
        minPayment = value;
    }

    function setMaxPayment(uint256 value) external onlyRole(PARAMS_ROLE) {
        if (value < minPayment || value > MAX_PAYMENT_CAP) revert OutOfRange("maxPayment", value);
        emit ParamChanged("maxPayment", maxPayment, value);
        maxPayment = value;
    }

    // ------------------------------------------------- admin: addresses

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

    /// @dev Pays every non creator share, then the creator the remainder (spec 3.2).
    /// Returns the platform share so a refund knows what the treasury funds.
    function _distribute(bytes32 paymentRef, uint256 amount, Recipient[] calldata rs, uint256 creatorIndex)
        internal
        returns (uint256 platformAmount)
    {
        uint256 paidOut;
        for (uint256 i; i < rs.length; ++i) {
            if (i == creatorIndex) continue;
            uint256 share = (amount * rs[i].bps) / BPS;
            if (rs[i].role == ROLE_PLATFORM) platformAmount = share;
            paidOut += share;
            usdc.safeTransfer(rs[i].to, share);
            emit Share(paymentRef, rs[i].to, rs[i].role, share);
        }
        uint256 creatorShare = amount - paidOut;
        address creator = rs[creatorIndex].to;
        usdc.safeTransfer(creator, creatorShare);
        emit Share(paymentRef, creator, ROLE_CREATOR, creatorShare);
    }

    /// @dev Enforces every recipient rule in spec 3.2. Returns the creator and its index.
    function _validateRecipients(Recipient[] calldata rs)
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
