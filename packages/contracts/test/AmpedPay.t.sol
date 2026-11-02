// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AmpedPay} from "../src/AmpedPay.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Spec docs/features/ampedpay.md, acceptance criteria 1 to 3 and 9, and the PAY-1 requirements.
contract AmpedPayTest is Test {
    MockUSDC internal usdc;
    AmpedPay internal pay;
    address internal impl;
    address internal proxyAdmin;

    address internal safe = makeAddr("safe");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal pauser = makeAddr("pauser");
    address internal promoter = makeAddr("promoter");
    address internal partner = makeAddr("partner");
    address internal stranger = makeAddr("stranger");

    uint256 internal signerPk = 0x5161;
    uint256 internal payerPk = 0xA11CE;
    uint256 internal creatorPk = 0xC4EA7;
    address internal signer;
    address internal payer;
    address internal creator;

    bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(signerPk);
        payer = vm.addr(payerPk);
        creator = vm.addr(creatorPk);

        usdc = new MockUSDC();
        impl = address(new AmpedPay(address(usdc)));
        bytes memory init = abi.encodeCall(AmpedPay.initialize, (safe, treasury, signer, relayer, pauser));
        pay = AmpedPay(address(new TransparentUpgradeableProxy(impl, safe, init)));
        proxyAdmin = address(uint160(uint256(vm.load(address(pay), ADMIN_SLOT))));

        usdc.mint(payer, 10_000e6);
        usdc.mint(creator, 10_000e6);
        usdc.mint(treasury, 10_000e6);
        vm.prank(treasury);
        usdc.approve(address(pay), type(uint256).max);
    }

    // ------------------------------------------------------------- helpers

    function _r(address to, uint16 bps, uint8 role) internal pure returns (AmpedPay.Recipient memory) {
        return AmpedPay.Recipient({to: to, bps: bps, role: role});
    }

    function _basicRecipients() internal view returns (AmpedPay.Recipient[] memory rs) {
        rs = new AmpedPay.Recipient[](2);
        rs[0] = _r(creator, 9_500, 0);
        rs[1] = _r(treasury, 500, 1);
    }

    function _split(bytes32 ref, uint256 amount, AmpedPay.Recipient[] memory rs)
        internal
        view
        returns (AmpedPay.SplitTable memory s)
    {
        s.paymentRef = ref;
        s.payer = payer;
        s.amount = amount;
        s.recipients = rs;
        s.validBefore = uint64(block.timestamp + 600);
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _authSig(uint256 pk, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                vm.addr(pk),
                address(pay),
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        return _sign(pk, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
    }

    /// Signs the split and the payer's authorization (nonce = split hash) and submits as the relayer.
    function _pay(AmpedPay.SplitTable memory s) internal returns (bytes32 splitHash) {
        splitHash = pay.hashSplit(s);
        bytes memory splitSig = _sign(signerPk, splitHash);
        bytes memory authSig = _authSig(payerPk, s.amount, 0, block.timestamp + 600, splitHash);
        vm.prank(relayer);
        pay.pay(s, splitSig, 0, block.timestamp + 600, authSig);
    }

    function _expectPayRevert(AmpedPay.SplitTable memory s, bytes memory err) internal {
        bytes32 h = pay.hashSplit(s);
        bytes memory splitSig = _sign(signerPk, h);
        bytes memory authSig = _authSig(payerPk, s.amount, 0, block.timestamp + 600, h);
        vm.prank(relayer);
        vm.expectRevert(err);
        pay.pay(s, splitSig, 0, block.timestamp + 600, authSig);
    }

    function _refundSig(bytes32 ref, uint64 deadline) internal view returns (bytes memory) {
        return _sign(creatorPk, pay.hashRefund(ref, deadline));
    }

    // ---------------------------------------------------------- deployment

    function test_initialState() public view {
        assertEq(address(pay.usdc()), address(usdc));
        assertEq(pay.treasury(), treasury);
        assertEq(pay.splitSigner(), signer);
        assertEq(pay.feeFloorBps(), 500);
        assertEq(pay.minCreatorBps(), 5_000);
        assertEq(pay.maxRecipients(), 6);
        assertEq(pay.maxSplitValidity(), 3_600);
        assertEq(pay.minPayment(), 500_000);
        assertEq(pay.maxPayment(), 1_000e6);
        assertTrue(pay.hasRole(pay.DEFAULT_ADMIN_ROLE(), safe));
        assertTrue(pay.hasRole(pay.PARAMS_ROLE(), safe));
        assertTrue(pay.hasRole(pay.PAUSER_ROLE(), safe));
        assertTrue(pay.hasRole(pay.PAUSER_ROLE(), pauser));
        assertTrue(pay.hasRole(pay.RELAYER_ROLE(), relayer));
        assertEq(ProxyAdmin(proxyAdmin).owner(), safe);
    }

    function test_initializeOnlyOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        pay.initialize(safe, treasury, signer, relayer, pauser);
    }

    function test_implementationCannotBeInitialized() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        AmpedPay(impl).initialize(safe, treasury, signer, relayer, pauser);
    }

    function test_constructorRejectsZeroUsdc() public {
        vm.expectRevert(AmpedPay.ZeroAddress.selector);
        new AmpedPay(address(0));
    }

    // --------------------------------------------------------------- pay

    function test_pay_creatorAndPlatform() public {
        AmpedPay.SplitTable memory s = _split(keccak256("p1"), 10e6, _basicRecipients());
        bytes32 h = pay.hashSplit(s);

        vm.expectEmit(address(pay));
        emit AmpedPay.Paid(s.paymentRef, payer, creator, 10e6, h);
        vm.expectEmit(address(pay));
        emit AmpedPay.Share(s.paymentRef, treasury, 1, 0.5e6);
        vm.expectEmit(address(pay));
        emit AmpedPay.Share(s.paymentRef, creator, 0, 9.5e6);
        _pay(s);

        assertEq(usdc.balanceOf(payer), 10_000e6 - 10e6);
        assertEq(usdc.balanceOf(creator), 10_000e6 + 9.5e6);
        assertEq(usdc.balanceOf(treasury), 10_000e6 + 0.5e6);
        assertEq(usdc.balanceOf(address(pay)), 0);

        AmpedPay.Payment memory p = pay.getPayment(s.paymentRef);
        assertEq(p.splitHash, h);
        assertEq(p.payer, payer);
        assertEq(p.creator, creator);
        assertEq(p.amount, 10e6);
        assertEq(p.platformAmount, 0.5e6);
        assertFalse(p.refunded);
    }

    function test_pay_withPromoterAndPartner() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](4);
        rs[0] = _r(creator, 7_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(promoter, 1_000, 2);
        rs[3] = _r(partner, 1_000, 3);
        _pay(_split(keccak256("p2"), 20e6, rs));

        assertEq(usdc.balanceOf(promoter), 2e6);
        assertEq(usdc.balanceOf(partner), 2e6);
        assertEq(usdc.balanceOf(treasury), 10_000e6 + 1e6);
        assertEq(usdc.balanceOf(creator), 10_000e6 + 15e6);
    }

    function test_pay_roundingRemainderGoesToCreator() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(treasury, 500, 1); // creator not first, to cover any order
        rs[1] = _r(promoter, 333, 2);
        rs[2] = _r(creator, 9_167, 0);
        uint256 amount = 1_000_003;
        _pay(_split(keccak256("p3"), amount, rs));

        uint256 platform = (amount * 500) / 10_000;
        uint256 promo = (amount * 333) / 10_000;
        assertEq(usdc.balanceOf(promoter), promo);
        assertEq(usdc.balanceOf(creator), 10_000e6 + amount - platform - promo);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function testFuzz_pay_sharesSumToAmount(uint256 amount, uint16 platformBps, uint16 promoterBps, uint16 partnerBps)
        public
    {
        amount = bound(amount, pay.minPayment(), pay.maxPayment());
        platformBps = uint16(bound(platformBps, 500, 1_000));
        // Platform at most 1,000 plus 2,000 and 2,000 keeps the creator at or above the 5,000 minimum.
        promoterBps = uint16(bound(promoterBps, 1, 2_000));
        partnerBps = uint16(bound(partnerBps, 1, 2_000));
        uint16 creatorBps = 10_000 - platformBps - promoterBps - partnerBps;

        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](4);
        rs[0] = _r(creator, creatorBps, 0);
        rs[1] = _r(treasury, platformBps, 1);
        rs[2] = _r(promoter, promoterBps, 2);
        rs[3] = _r(partner, partnerBps, 3);

        uint256 before = usdc.balanceOf(creator) + usdc.balanceOf(treasury);
        _pay(_split(keccak256(abi.encode(amount, platformBps, promoterBps, partnerBps)), amount, rs));

        uint256 total = usdc.balanceOf(creator) + usdc.balanceOf(treasury) - before + usdc.balanceOf(promoter)
            + usdc.balanceOf(partner);
        assertEq(total, amount);
        assertEq(usdc.balanceOf(address(pay)), 0);
        assertEq(usdc.balanceOf(treasury) - 10_000e6, (amount * platformBps) / 10_000);
    }

    // ------------------------------------------------- nonce binding (2.3)

    function test_revert_authorizationPairedWithAnotherSplit() public {
        AmpedPay.SplitTable memory a = _split(keccak256("a"), 10e6, _basicRecipients());
        AmpedPay.Recipient[] memory other = new AmpedPay.Recipient[](3);
        other[0] = _r(creator, 8_500, 0);
        other[1] = _r(treasury, 500, 1);
        other[2] = _r(promoter, 1_000, 2);
        AmpedPay.SplitTable memory b = _split(keccak256("a"), 10e6, other);

        bytes memory authForA = _authSig(payerPk, 10e6, 0, block.timestamp + 600, pay.hashSplit(a));
        bytes memory sigB = _sign(signerPk, pay.hashSplit(b));

        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        pay.pay(b, sigB, 0, block.timestamp + 600, authForA);
    }

    function test_revert_authorizationReusedForNewPayment() public {
        AmpedPay.SplitTable memory a = _split(keccak256("first"), 10e6, _basicRecipients());
        bytes32 ha = pay.hashSplit(a);
        bytes memory authA = _authSig(payerPk, 10e6, 0, block.timestamp + 600, ha);
        vm.prank(relayer);
        pay.pay(a, _sign(signerPk, ha), 0, block.timestamp + 600, authA);

        AmpedPay.SplitTable memory b = _split(keccak256("second"), 10e6, _basicRecipients());
        bytes memory sigB = _sign(signerPk, pay.hashSplit(b));
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        pay.pay(b, sigB, 0, block.timestamp + 600, authA);
    }

    // ------------------------------------------------ refusals (accept 2)

    function test_revert_notRelayer() public {
        AmpedPay.SplitTable memory s = _split(keccak256("x"), 10e6, _basicRecipients());
        bytes32 h = pay.hashSplit(s);
        bytes memory splitSig = _sign(signerPk, h);
        bytes memory authSig = _authSig(payerPk, s.amount, 0, block.timestamp + 600, h);
        bytes32 role = pay.RELAYER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        pay.pay(s, splitSig, 0, block.timestamp + 600, authSig);
    }

    function test_revert_paused() public {
        vm.prank(pauser);
        pay.pause();
        _expectPayRevert(
            _split(keccak256("x"), 10e6, _basicRecipients()),
            abi.encodeWithSelector(PausableUpgradeable.EnforcedPause.selector)
        );
    }

    function test_revert_splitExpired() public {
        AmpedPay.SplitTable memory s = _split(keccak256("x"), 10e6, _basicRecipients());
        s.validBefore = uint64(block.timestamp - 1);
        _expectPayRevert(s, abi.encodeWithSelector(AmpedPay.SplitExpired.selector));
    }

    function test_revert_splitValidityTooLong() public {
        AmpedPay.SplitTable memory s = _split(keccak256("x"), 10e6, _basicRecipients());
        s.validBefore = uint64(block.timestamp + 3_601);
        _expectPayRevert(s, abi.encodeWithSelector(AmpedPay.SplitValidityTooLong.selector));
    }

    function test_revert_wrongSplitSigner() public {
        AmpedPay.SplitTable memory s = _split(keccak256("x"), 10e6, _basicRecipients());
        bytes32 h = pay.hashSplit(s);
        bytes memory badSig = _sign(0xBAD, h);
        bytes memory authSig = _authSig(payerPk, s.amount, 0, block.timestamp + 600, h);
        vm.prank(relayer);
        vm.expectRevert(AmpedPay.InvalidSplitSignature.selector);
        pay.pay(s, badSig, 0, block.timestamp + 600, authSig);
    }

    function test_revert_paymentRefReused() public {
        _pay(_split(keccak256("dup"), 10e6, _basicRecipients()));
        AmpedPay.SplitTable memory s = _split(keccak256("dup"), 5e6, _basicRecipients());
        _expectPayRevert(s, abi.encodeWithSelector(AmpedPay.PaymentRefUsed.selector));
    }

    function test_revert_zeroPaymentRef() public {
        _expectPayRevert(
            _split(bytes32(0), 10e6, _basicRecipients()), abi.encodeWithSelector(AmpedPay.ZeroPaymentRef.selector)
        );
    }

    function test_revert_amountBelowMinimum() public {
        _expectPayRevert(
            _split(keccak256("x"), 499_999, _basicRecipients()),
            abi.encodeWithSelector(AmpedPay.AmountOutOfRange.selector, 499_999)
        );
    }

    function test_revert_amountAboveMaximum() public {
        _expectPayRevert(
            _split(keccak256("x"), 1_000e6 + 1, _basicRecipients()),
            abi.encodeWithSelector(AmpedPay.AmountOutOfRange.selector, 1_000e6 + 1)
        );
    }

    function test_revert_bpsNotTenThousand() public {
        AmpedPay.Recipient[] memory rs = _basicRecipients();
        rs[0].bps = 9_000;
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.BpsSum.selector, 9_500));
    }

    function test_revert_platformNotTreasury() public {
        AmpedPay.Recipient[] memory rs = _basicRecipients();
        rs[1].to = stranger;
        _expectPayRevert(
            _split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.PlatformNotTreasury.selector)
        );
    }

    function test_revert_platformBelowFloor() public {
        AmpedPay.Recipient[] memory rs = _basicRecipients();
        rs[0].bps = 9_501;
        rs[1].bps = 499;
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.PlatformBps.selector, 499));
    }

    function test_revert_platformAboveTenPercent() public {
        AmpedPay.Recipient[] memory rs = _basicRecipients();
        rs[0].bps = 8_999;
        rs[1].bps = 1_001;
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.PlatformBps.selector, 1_001));
    }

    function test_revert_creatorBelowMinimum() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 4_999, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(partner, 4_501, 3);
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.CreatorBps.selector, 4_999));
    }

    function test_revert_twoPromoters() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](4);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(promoter, 500, 2);
        rs[3] = _r(partner, 500, 2);
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.PromoterCount.selector));
    }

    function test_revert_twoCreators() public {
        // Two creator rows at 5,000 each pass every per row rule, so the count check is what refuses.
        AmpedPay.Recipient[] memory two = new AmpedPay.Recipient[](2);
        two[0] = _r(creator, 5_000, 0);
        two[1] = _r(partner, 5_000, 0);
        _expectPayRevert(_split(keccak256("x"), 10e6, two), abi.encodeWithSelector(AmpedPay.CreatorCount.selector));
    }

    function test_revert_noPlatform() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](2);
        rs[0] = _r(creator, 9_000, 0);
        rs[1] = _r(partner, 1_000, 3);
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.PlatformCount.selector));
    }

    function test_revert_tooManyRecipients() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](7);
        rs[0] = _r(creator, 9_000, 0);
        rs[1] = _r(treasury, 500, 1);
        for (uint256 i = 2; i < 7; ++i) {
            rs[i] = _r(makeAddr(string(abi.encode(i))), 100, 3);
        }
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.RecipientCount.selector, 7));
    }

    function test_revert_oneRecipient() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](1);
        rs[0] = _r(creator, 10_000, 0);
        _expectPayRevert(_split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.RecipientCount.selector, 1));
    }

    function test_revert_duplicateRecipient() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(creator, 1_000, 3);
        _expectPayRevert(
            _split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.DuplicateRecipient.selector, creator)
        );
    }

    function test_revert_zeroAddressRecipient() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(address(0), 1_000, 3);
        _expectPayRevert(
            _split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.InvalidRecipient.selector, 2)
        );
    }

    function test_revert_zeroBpsRecipient() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 9_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(partner, 0, 3);
        _expectPayRevert(
            _split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.InvalidRecipient.selector, 2)
        );
    }

    function test_revert_unknownRole() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(partner, 1_000, 4);
        _expectPayRevert(
            _split(keccak256("x"), 10e6, rs), abi.encodeWithSelector(AmpedPay.InvalidRecipient.selector, 2)
        );
    }

    // ------------------------------------------------------- refund (9)

    function test_refund_fullAmountFromCreatorAndTreasury() public {
        AmpedPay.Recipient[] memory rs = new AmpedPay.Recipient[](3);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(promoter, 1_000, 2);
        bytes32 ref = keccak256("refund");
        _pay(_split(ref, 20e6, rs));

        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 promoterBefore = usdc.balanceOf(promoter);

        vm.prank(creator);
        usdc.approve(address(pay), 19e6);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _refundSig(ref, deadline);
        vm.expectEmit(address(pay));
        emit AmpedPay.Refunded(ref, payer, creator, 20e6);
        vm.prank(relayer);
        pay.refund(ref, deadline, sig, 0, "");

        assertEq(usdc.balanceOf(payer), payerBefore + 20e6);
        assertEq(usdc.balanceOf(creator), creatorBefore - 19e6);
        assertEq(usdc.balanceOf(treasury), treasuryBefore - 1e6);
        assertEq(usdc.balanceOf(promoter), promoterBefore, "promoter share is not pulled back");
        assertTrue(pay.getPayment(ref).refunded);
    }

    function test_refund_withCreatorPermit() public {
        bytes32 ref = keccak256("permit");
        _pay(_split(ref, 10e6, _basicRecipients()));

        uint256 permitDeadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(usdc.PERMIT_TYPEHASH(), creator, address(pay), 9.5e6, usdc.nonces(creator), permitDeadline)
        );
        bytes memory permitSig =
            _sign(creatorPk, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
        uint64 deadline = uint64(block.timestamp + 1 hours);

        bytes memory sig = _refundSig(ref, deadline);
        vm.prank(relayer);
        pay.refund(ref, deadline, sig, permitDeadline, permitSig);
        assertTrue(pay.getPayment(ref).refunded);
    }

    function test_revert_refundTwice() public {
        bytes32 ref = keccak256("twice");
        _pay(_split(ref, 10e6, _basicRecipients()));
        vm.prank(creator);
        usdc.approve(address(pay), type(uint256).max);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _refundSig(ref, deadline);
        vm.prank(relayer);
        pay.refund(ref, deadline, sig, 0, "");
        vm.prank(relayer);
        vm.expectRevert(AmpedPay.AlreadyRefunded.selector);
        pay.refund(ref, deadline, sig, 0, "");
    }

    function test_revert_refundUnknownPayment() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(relayer);
        vm.expectRevert(AmpedPay.UnknownPayment.selector);
        pay.refund(keccak256("none"), deadline, "", 0, "");
    }

    function test_revert_refundExpired() public {
        bytes32 ref = keccak256("late");
        _pay(_split(ref, 10e6, _basicRecipients()));
        uint64 deadline = uint64(block.timestamp - 1);
        bytes memory sig = _refundSig(ref, deadline);
        vm.prank(relayer);
        vm.expectRevert(AmpedPay.RefundExpired.selector);
        pay.refund(ref, deadline, sig, 0, "");
    }

    function test_revert_refundNotSignedByCreator() public {
        bytes32 ref = keccak256("forged");
        _pay(_split(ref, 10e6, _basicRecipients()));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(payerPk, pay.hashRefund(ref, deadline));
        vm.prank(relayer);
        vm.expectRevert(AmpedPay.InvalidRefundSignature.selector);
        pay.refund(ref, deadline, sig, 0, "");
    }

    function test_revert_refundNotRelayer() public {
        bytes32 ref = keccak256("relay");
        _pay(_split(ref, 10e6, _basicRecipients()));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _refundSig(ref, deadline);
        bytes32 role = pay.RELAYER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        pay.refund(ref, deadline, sig, 0, "");
    }

    // ------------------------------------------------------ pause (6)

    function test_pause_byPauserAndSafe_unpauseOnlySafe() public {
        vm.prank(pauser);
        pay.pause();
        assertTrue(pay.paused());

        bytes32 adminRole = pay.DEFAULT_ADMIN_ROLE();
        vm.prank(pauser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, adminRole)
        );
        pay.unpause();

        vm.prank(safe);
        pay.unpause();
        assertFalse(pay.paused());

        vm.prank(safe);
        pay.pause();
        assertTrue(pay.paused());
    }

    function test_revert_pauseByStranger() public {
        bytes32 role = pay.PAUSER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        pay.pause();
    }

    // --------------------------------------------------- params (3)

    function test_setters_emitAndApply() public {
        vm.startPrank(safe);
        vm.expectEmit(address(pay));
        emit AmpedPay.ParamChanged("feeFloorBps", 500, 450);
        pay.setFeeFloorBps(450);
        pay.setMinCreatorBps(6_000);
        pay.setMaxRecipients(8);
        pay.setMaxSplitValidity(600);
        pay.setMaxPayment(5_000e6);
        pay.setMinPayment(1e6);
        vm.expectEmit(address(pay));
        emit AmpedPay.ParamChanged("treasury", uint256(uint160(treasury)), uint256(uint160(stranger)));
        pay.setTreasury(stranger);
        pay.setSplitSigner(stranger);
        vm.stopPrank();

        assertEq(pay.feeFloorBps(), 450);
        assertEq(pay.minCreatorBps(), 6_000);
        assertEq(pay.maxRecipients(), 8);
        assertEq(pay.maxSplitValidity(), 600);
        assertEq(pay.maxPayment(), 5_000e6);
        assertEq(pay.minPayment(), 1e6);
        assertEq(pay.treasury(), stranger);
        assertEq(pay.splitSigner(), stranger);
    }

    function test_revert_settersOutOfRange() public {
        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("feeFloorBps"), 1_001));
        pay.setFeeFloorBps(1_001);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("minCreatorBps"), 4_999));
        pay.setMinCreatorBps(4_999);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("minCreatorBps"), 10_001));
        pay.setMinCreatorBps(10_001);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxRecipients"), 1));
        pay.setMaxRecipients(1);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxRecipients"), 9));
        pay.setMaxRecipients(9);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxSplitValidity"), 59));
        pay.setMaxSplitValidity(59);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxSplitValidity"), 86_401));
        pay.setMaxSplitValidity(86_401);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("minPayment"), 9_999));
        pay.setMinPayment(9_999);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("minPayment"), 1_000e6 + 1));
        pay.setMinPayment(1_000e6 + 1);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxPayment"), 499_999));
        pay.setMaxPayment(499_999);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("maxPayment"), 100_000e6 + 1));
        pay.setMaxPayment(100_000e6 + 1);
        vm.expectRevert(AmpedPay.ZeroAddress.selector);
        pay.setTreasury(address(0));
        vm.expectRevert(AmpedPay.ZeroAddress.selector);
        pay.setSplitSigner(address(0));
        vm.stopPrank();
    }

    function test_revert_floorAndCreatorMinimumCannotExceedTotal() public {
        vm.startPrank(safe);
        pay.setMinCreatorBps(9_500);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("feeFloorBps"), 501));
        pay.setFeeFloorBps(501);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("minCreatorBps"), 9_501));
        pay.setMinCreatorBps(9_501);
        vm.stopPrank();
    }

    function testFuzz_feeFloorNeverAboveTenPercent(uint16 value) public {
        vm.assume(value > 1_000);
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(AmpedPay.OutOfRange.selector, bytes32("feeFloorBps"), value));
        pay.setFeeFloorBps(value);
    }

    function test_revert_settersWrongRole() public {
        bytes32 paramsRole = pay.PARAMS_ROLE();
        bytes32 adminRole = pay.DEFAULT_ADMIN_ROLE();
        vm.startPrank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, paramsRole)
        );
        pay.setFeeFloorBps(400);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, adminRole)
        );
        pay.setTreasury(relayer);
        vm.stopPrank();

        vm.prank(pauser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, paramsRole)
        );
        pay.setMaxPayment(2_000e6);
    }

    function test_relayerAllowlist_managedBySafe() public {
        address relayer2 = makeAddr("relayer2");
        bytes32 role = pay.RELAYER_ROLE();
        vm.prank(safe);
        pay.grantRole(role, relayer2);
        assertTrue(pay.hasRole(role, relayer2));
        vm.prank(safe);
        pay.revokeRole(role, relayer);
        assertFalse(pay.hasRole(role, relayer));

        bytes32 adminRole = pay.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        pay.grantRole(role, stranger);
    }

    function test_lowerFloorThenPlatformBelowFivePercentPays() public {
        vm.prank(safe);
        pay.setFeeFloorBps(450);
        AmpedPay.Recipient[] memory rs = _basicRecipients();
        rs[0].bps = 9_550;
        rs[1].bps = 450;
        _pay(_split(keccak256("lower"), 10e6, rs));
        assertEq(usdc.balanceOf(treasury), 10_000e6 + 0.45e6);
    }

    // ----------------------------------------------------- upgrades

    function test_upgradeOnlyBySafeThroughProxyAdmin() public {
        address newImpl = address(new AmpedPay(address(usdc)));
        vm.prank(stranger);
        vm.expectRevert();
        ProxyAdmin(proxyAdmin).upgradeAndCall(TransparentUpgradeableProxyLike(address(pay)), newImpl, "");

        vm.prank(safe);
        ProxyAdmin(proxyAdmin).upgradeAndCall(TransparentUpgradeableProxyLike(address(pay)), newImpl, "");
        assertEq(pay.feeFloorBps(), 500, "state survives the upgrade");
    }
}

import {
    ITransparentUpgradeableProxy as TransparentUpgradeableProxyLike
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
