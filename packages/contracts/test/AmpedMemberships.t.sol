// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
    ITransparentUpgradeableProxy as TransparentUpgradeableProxyLike
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {AmpedMemberships} from "../src/AmpedMemberships.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Spec docs/features/ampedmemberships.md: permit allowance, join, keeper renew, cancel, pause,
/// ranges and roles (PAY-3), and memberships spec acceptance 8 and 9 as amended on 2 Nov.
contract AmpedMembershipsTest is Test {
    MockUSDC internal usdc;
    AmpedMemberships internal mem;
    address internal proxyAdmin;

    address internal safe = makeAddr("safe");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal pauser = makeAddr("pauser");
    address internal promoter = makeAddr("promoter");
    address internal partner = makeAddr("partner");
    address internal stranger = makeAddr("stranger");

    uint256 internal signerPk = 0x5161;
    uint256 internal memberPk = 0xA11CE;
    uint256 internal creatorPk = 0xC4EA7;
    address internal signer;
    address internal member;
    address internal creator;

    uint32 internal constant DAYS_30 = 30 days;
    uint256 internal constant PRICE = 5e6;
    bytes32 internal constant REF = keccak256("membership-1");
    bytes32 internal constant PLAN = keccak256("plan-1");
    bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

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
    event Charged(
        bytes32 indexed subscriptionRef, address indexed member, uint256 amount, uint32 charge, uint64 nextDue
    );
    event Share(bytes32 indexed subscriptionRef, address indexed to, uint8 role, uint256 amount);
    event Canceled(bytes32 indexed subscriptionRef, address indexed member, uint8 endedBy);
    event ParamChanged(bytes32 indexed name, uint256 oldValue, uint256 newValue);

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(signerPk);
        member = vm.addr(memberPk);
        creator = vm.addr(creatorPk);

        usdc = new MockUSDC();
        address impl = address(new AmpedMemberships(address(usdc)));
        bytes memory init = abi.encodeCall(AmpedMemberships.initialize, (safe, treasury, signer, relayer, pauser));
        mem = AmpedMemberships(address(new TransparentUpgradeableProxy(impl, safe, init)));
        proxyAdmin = address(uint160(uint256(vm.load(address(mem), ADMIN_SLOT))));

        usdc.mint(member, 1_000e6);
    }

    // ------------------------------------------------------------- helpers

    function _r(address to, uint16 bps, uint8 role) internal pure returns (AmpedMemberships.Recipient memory) {
        return AmpedMemberships.Recipient({to: to, bps: bps, role: role});
    }

    function _basic() internal view returns (AmpedMemberships.Recipient[] memory rs) {
        rs = new AmpedMemberships.Recipient[](2);
        rs[0] = _r(creator, 9_500, 0);
        rs[1] = _r(treasury, 500, 1);
    }

    function _table(bytes32 ref, uint256 price, uint32 period, AmpedMemberships.Recipient[] memory rs)
        internal
        view
        returns (AmpedMemberships.JoinTable memory t)
    {
        t.subscriptionRef = ref;
        t.planRef = PLAN;
        t.member = member;
        t.price = price;
        t.periodSeconds = period;
        t.recipients = rs;
        t.validBefore = uint64(block.timestamp + 600);
    }

    function _table() internal view returns (AmpedMemberships.JoinTable memory) {
        return _table(REF, PRICE, DAYS_30, _basic());
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permitSig(uint256 pk, uint256 value, uint256 deadline) internal view returns (bytes memory) {
        address owner = vm.addr(pk);
        bytes32 structHash =
            keccak256(abi.encode(usdc.PERMIT_TYPEHASH(), owner, address(mem), value, usdc.nonces(owner), deadline));
        return _sign(pk, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
    }

    /// Signs the terms as the split signer and the member, with a permit for 12 periods, and joins.
    function _join(AmpedMemberships.JoinTable memory t) internal returns (bytes32 joinHash) {
        joinHash = mem.hashJoin(t);
        uint256 allowance = t.price * 12;
        bytes memory permit = _permitSig(memberPk, allowance, block.timestamp + 600);
        vm.prank(relayer);
        mem.join(t, _sign(signerPk, joinHash), _sign(memberPk, joinHash), allowance, block.timestamp + 600, permit);
    }

    function _expectJoinRevert(AmpedMemberships.JoinTable memory t, bytes memory err) internal {
        bytes32 h = mem.hashJoin(t);
        bytes memory permit = _permitSig(memberPk, t.price * 12, block.timestamp + 600);
        vm.prank(relayer);
        vm.expectRevert(err);
        mem.join(t, _sign(signerPk, h), _sign(memberPk, h), t.price * 12, block.timestamp + 600, permit);
    }

    function _renew() internal {
        vm.prank(relayer);
        mem.renew(REF);
    }

    // ---------------------------------------------------------- deployment

    function test_initialState() public view {
        assertEq(address(mem.usdc()), address(usdc));
        assertEq(mem.treasury(), treasury);
        assertEq(mem.splitSigner(), signer);
        assertEq(mem.feeFloorBps(), 500);
        assertEq(mem.minCreatorBps(), 5_000);
        assertEq(mem.maxRecipients(), 6);
        assertEq(mem.maxJoinValidity(), 3_600);
        assertEq(mem.renewGrace(), 7 days);
        assertEq(mem.minPrice(), 1e6);
        assertEq(mem.maxPrice(), 5_000e6);
        assertTrue(mem.hasRole(mem.DEFAULT_ADMIN_ROLE(), safe));
        assertTrue(mem.hasRole(mem.PARAMS_ROLE(), safe));
        assertTrue(mem.hasRole(mem.PAUSER_ROLE(), safe));
        assertTrue(mem.hasRole(mem.PAUSER_ROLE(), pauser));
        assertTrue(mem.hasRole(mem.RELAYER_ROLE(), relayer));
        assertFalse(mem.hasRole(mem.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(ProxyAdmin(proxyAdmin).owner(), safe);
    }

    function test_revert_initializeTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        mem.initialize(safe, treasury, signer, relayer, pauser);
    }

    function test_revert_implementationCannotBeInitialized() public {
        AmpedMemberships impl = new AmpedMemberships(address(usdc));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(safe, treasury, signer, relayer, pauser);
    }

    function test_revert_zeroUsdc() public {
        vm.expectRevert(AmpedMemberships.ZeroAddress.selector);
        new AmpedMemberships(address(0));
    }

    // ---------------------------------------------------------------- join

    function test_join_pullsFirstPeriodAndStoresTheTerms() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        uint64 due = uint64(block.timestamp) + DAYS_30;

        vm.expectEmit(address(mem));
        emit Joined(REF, PLAN, member, creator, PRICE, DAYS_30, due, h);
        vm.expectEmit(address(mem));
        emit Share(REF, treasury, 1, 250_000);
        vm.expectEmit(address(mem));
        emit Share(REF, creator, 0, 4_750_000);
        vm.expectEmit(address(mem));
        emit Charged(REF, member, PRICE, 1, due);
        _join(t);

        assertEq(usdc.balanceOf(creator), 4_750_000);
        assertEq(usdc.balanceOf(treasury), 250_000);
        assertEq(usdc.balanceOf(member), 1_000e6 - PRICE);
        assertEq(usdc.balanceOf(address(mem)), 0, "never holds USDC");
        assertEq(usdc.allowance(member, address(mem)), PRICE * 11, "12 periods allowed, one used");

        AmpedMemberships.Subscription memory s = mem.getSubscription(REF);
        assertEq(s.member, member);
        assertEq(s.creator, creator);
        assertEq(s.planRef, PLAN);
        assertEq(s.joinHash, h);
        assertEq(s.price, PRICE);
        assertEq(s.periodSeconds, DAYS_30);
        assertEq(s.charges, 1);
        assertEq(s.nextDue, due);
        assertTrue(s.active);
        AmpedMemberships.Recipient[] memory rs = mem.getRecipients(REF);
        assertEq(rs.length, 2);
        assertEq(rs[0].to, creator);
        assertEq(rs[1].bps, 500);
    }

    function test_join_paysPromoterAndPartnerAtJoinAndRenewal() public {
        AmpedMemberships.Recipient[] memory rs = new AmpedMemberships.Recipient[](4);
        rs[0] = _r(creator, 7_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(promoter, 1_000, 2);
        rs[3] = _r(partner, 1_000, 3);
        _join(_table(REF, 10e6, DAYS_30, rs));
        vm.warp(block.timestamp + DAYS_30);
        _renew();
        assertEq(usdc.balanceOf(creator), 15e6);
        assertEq(usdc.balanceOf(treasury), 1e6);
        assertEq(usdc.balanceOf(promoter), 2e6);
        assertEq(usdc.balanceOf(partner), 2e6);
    }

    function test_join_withoutPermitUsesTheExistingAllowance() public {
        vm.prank(member);
        usdc.approve(address(mem), PRICE);
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        vm.prank(relayer);
        mem.join(t, _sign(signerPk, h), _sign(memberPk, h), 0, 0, "");
        assertEq(usdc.balanceOf(creator), 4_750_000);
    }

    function test_join_survivesAFrontRunPermit() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        bytes memory permit = _permitSig(memberPk, PRICE * 12, block.timestamp + 600);
        // Anyone can submit the permit first; the join still works on the allowance it set
        usdc.permit(member, address(mem), PRICE * 12, block.timestamp + 600, permit);
        vm.prank(relayer);
        mem.join(t, _sign(signerPk, h), _sign(memberPk, h), PRICE * 12, block.timestamp + 600, permit);
        assertTrue(mem.getSubscription(REF).active);
    }

    function test_join_yearly() public {
        _join(_table(REF, 50e6, 365 days, _basic()));
        assertEq(mem.getSubscription(REF).nextDue, uint64(block.timestamp + 365 days));
    }

    function test_revert_join_shortAllowanceTakesNothing() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        bytes memory permit = _permitSig(memberPk, PRICE - 1, block.timestamp + 600);
        vm.prank(relayer);
        vm.expectRevert();
        mem.join(t, _sign(signerPk, h), _sign(memberPk, h), PRICE - 1, block.timestamp + 600, permit);
        assertEq(mem.getSubscription(REF).member, address(0), "the ref is still free");
    }

    function test_revert_join_notRelayer() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        bytes32 role = mem.RELAYER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        mem.join(t, _sign(signerPk, h), _sign(memberPk, h), 0, 0, "");
    }

    function test_revert_join_paused() public {
        vm.prank(pauser);
        mem.pause();
        _expectJoinRevert(_table(), abi.encodeWithSelector(PausableUpgradeable.EnforcedPause.selector));
    }

    function test_revert_join_expiredAndTooLong() public {
        AmpedMemberships.JoinTable memory t = _table();
        t.validBefore = uint64(block.timestamp - 1);
        _expectJoinRevert(t, abi.encodeWithSelector(AmpedMemberships.JoinExpired.selector));
        t.validBefore = uint64(block.timestamp + 3_601);
        _expectJoinRevert(t, abi.encodeWithSelector(AmpedMemberships.JoinValidityTooLong.selector));
    }

    function test_revert_join_refZeroOrUsed() public {
        _expectJoinRevert(
            _table(bytes32(0), PRICE, DAYS_30, _basic()),
            abi.encodeWithSelector(AmpedMemberships.ZeroSubscriptionRef.selector)
        );
        _join(_table());
        _expectJoinRevert(_table(), abi.encodeWithSelector(AmpedMemberships.SubscriptionRefUsed.selector));
    }

    function test_revert_join_priceAndPeriodOutOfRange() public {
        _expectJoinRevert(
            _table(REF, 1e6 - 1, DAYS_30, _basic()),
            abi.encodeWithSelector(AmpedMemberships.PriceOutOfRange.selector, 1e6 - 1)
        );
        _expectJoinRevert(
            _table(REF, 5_000e6 + 1, DAYS_30, _basic()),
            abi.encodeWithSelector(AmpedMemberships.PriceOutOfRange.selector, 5_000e6 + 1)
        );
        _expectJoinRevert(
            _table(REF, PRICE, 1 days - 1, _basic()),
            abi.encodeWithSelector(AmpedMemberships.PeriodOutOfRange.selector, uint32(1 days - 1))
        );
        _expectJoinRevert(
            _table(REF, PRICE, 366 days + 1, _basic()),
            abi.encodeWithSelector(AmpedMemberships.PeriodOutOfRange.selector, uint32(366 days + 1))
        );
    }

    function test_revert_join_splitSignedByAnotherKey() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.InvalidSplitSignature.selector);
        mem.join(t, _sign(creatorPk, h), _sign(memberPk, h), 0, 0, "");
    }

    /// The member's signature binds the terms: the relayer can't reuse it for another price.
    function test_revert_join_memberSignedOtherTerms() public {
        AmpedMemberships.JoinTable memory signedByMember = _table();
        bytes32 memberHash = mem.hashJoin(signedByMember);
        AmpedMemberships.JoinTable memory t = _table(REF, PRICE * 2, DAYS_30, _basic());
        bytes32 h = mem.hashJoin(t);
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.InvalidMemberSignature.selector);
        mem.join(t, _sign(signerPk, h), _sign(memberPk, memberHash), 0, 0, "");
    }

    function test_revert_join_memberSignatureFromAnotherKey() public {
        AmpedMemberships.JoinTable memory t = _table();
        bytes32 h = mem.hashJoin(t);
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.InvalidMemberSignature.selector);
        mem.join(t, _sign(signerPk, h), _sign(creatorPk, h), 0, 0, "");
    }

    function test_revert_join_recipientRules() public {
        AmpedMemberships.Recipient[] memory one = new AmpedMemberships.Recipient[](1);
        one[0] = _r(creator, 10_000, 0);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, one), abi.encodeWithSelector(AmpedMemberships.RecipientCount.selector, 1)
        );

        AmpedMemberships.Recipient[] memory rs = _basic();
        rs[1] = _r(address(0), 500, 1);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.InvalidRecipient.selector, 1)
        );

        rs = _basic();
        rs[0] = _r(member, 9_500, 0);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.MemberIsRecipient.selector)
        );

        rs = _basic();
        rs[1] = _r(creator, 500, 1);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs),
            abi.encodeWithSelector(AmpedMemberships.DuplicateRecipient.selector, creator)
        );

        rs = _basic();
        rs[0].bps = 9_000;
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.BpsSum.selector, 9_500)
        );

        rs = _basic();
        rs[1] = _r(stranger, 500, 1);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.PlatformNotTreasury.selector)
        );

        rs = _basic();
        rs[0].bps = 9_600;
        rs[1].bps = 400;
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.PlatformBps.selector, 400)
        );

        rs = _basic();
        rs[0].bps = 8_900;
        rs[1].bps = 1_100;
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.PlatformBps.selector, 1_100)
        );

        rs = new AmpedMemberships.Recipient[](3);
        rs[0] = _r(creator, 4_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(partner, 5_000, 3);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.CreatorBps.selector, 4_500)
        );

        // No creator row (two creators can't both reach the 5,000 floor beside a platform row)
        rs = new AmpedMemberships.Recipient[](2);
        rs[0] = _r(partner, 9_500, 3);
        rs[1] = _r(treasury, 500, 1);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.CreatorCount.selector)
        );

        rs = new AmpedMemberships.Recipient[](2);
        rs[0] = _r(creator, 9_500, 0);
        rs[1] = _r(partner, 500, 3);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.PlatformCount.selector)
        );

        rs = new AmpedMemberships.Recipient[](4);
        rs[0] = _r(creator, 8_500, 0);
        rs[1] = _r(treasury, 500, 1);
        rs[2] = _r(promoter, 500, 2);
        rs[3] = _r(partner, 500, 2);
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.PromoterCount.selector)
        );

        rs = _basic();
        rs[1].role = 4;
        _expectJoinRevert(
            _table(REF, PRICE, DAYS_30, rs), abi.encodeWithSelector(AmpedMemberships.InvalidRecipient.selector, 1)
        );
    }

    // --------------------------------------------------------------- renew

    function test_renew_onTheDueDateKeepsTheSchedule() public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        vm.warp(due + 3 hours);
        vm.expectEmit(address(mem));
        emit Charged(REF, member, PRICE, 2, due + DAYS_30);
        _renew();
        AmpedMemberships.Subscription memory s = mem.getSubscription(REF);
        assertEq(s.nextDue, due + DAYS_30);
        assertEq(s.charges, 2);
        assertEq(usdc.balanceOf(creator), 2 * 4_750_000);
    }

    function test_renew_lateInTheGraceStartsAFullPeriodFromNow() public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        vm.warp(due + 5 days);
        _renew();
        assertEq(mem.getSubscription(REF).nextDue, uint64(due + 5 days + DAYS_30));
    }

    function test_revert_renew_beforeDue() public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        vm.warp(due - 1);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.NotDue.selector, due));
        mem.renew(REF);
        assertFalse(mem.isRenewable(REF));
    }

    function test_revert_renew_afterTheGrace() public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        vm.warp(due + 7 days);
        assertTrue(mem.isRenewable(REF));
        vm.warp(due + 7 days + 1);
        assertFalse(mem.isRenewable(REF));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.Lapsed.selector, due));
        mem.renew(REF);
    }

    function test_revert_renew_shortBalanceOrAllowanceChargesNothing() public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        vm.warp(due);
        vm.prank(member);
        usdc.approve(address(mem), PRICE - 1);
        vm.prank(relayer);
        vm.expectRevert();
        mem.renew(REF);
        AmpedMemberships.Subscription memory s = mem.getSubscription(REF);
        assertEq(s.nextDue, due, "still due");
        assertEq(s.charges, 1);

        // The member tops up inside the grace; the keeper tries again
        vm.prank(member);
        usdc.approve(address(mem), PRICE * 12);
        vm.warp(due + 2 days);
        _renew();
        assertEq(mem.getSubscription(REF).charges, 2);
    }

    function test_renew_twelvePeriodsUseTheAllowanceThenStop() public {
        _join(_table());
        for (uint256 i; i < 11; ++i) {
            vm.warp(mem.getSubscription(REF).nextDue);
            _renew();
        }
        assertEq(mem.getSubscription(REF).charges, 12);
        assertEq(usdc.allowance(member, address(mem)), 0);
        vm.warp(mem.getSubscription(REF).nextDue);
        vm.prank(relayer);
        vm.expectRevert();
        mem.renew(REF);
    }

    function test_renew_paysTheCurrentTreasury() public {
        _join(_table());
        address newTreasury = makeAddr("newTreasury");
        vm.prank(safe);
        mem.setTreasury(newTreasury);
        vm.warp(mem.getSubscription(REF).nextDue);
        _renew();
        assertEq(usdc.balanceOf(newTreasury), 250_000);
    }

    function test_renew_keepsTheJoinTermsAfterLimitsChange() public {
        _join(_table());
        vm.prank(safe);
        mem.setFeeFloorBps(800);
        vm.warp(mem.getSubscription(REF).nextDue);
        _renew();
        assertEq(usdc.balanceOf(treasury), 2 * 250_000, "the 5% agreed at join");
    }

    function test_revert_renew_rolesPauseAndUnknown() public {
        _join(_table());
        vm.warp(mem.getSubscription(REF).nextDue);
        bytes32 role = mem.RELAYER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        mem.renew(REF);

        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.UnknownSubscription.selector);
        mem.renew(keccak256("nope"));

        vm.prank(pauser);
        mem.pause();
        vm.prank(relayer);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        mem.renew(REF);
    }

    // -------------------------------------------------------------- cancel

    function test_cancel_byTheMemberStopsEveryLaterCharge() public {
        _join(_table());
        vm.expectEmit(address(mem));
        emit Canceled(REF, member, 0);
        vm.prank(member);
        mem.cancel(REF);
        assertFalse(mem.getSubscription(REF).active);
        vm.warp(block.timestamp + DAYS_30);
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.NotActive.selector);
        mem.renew(REF);
        assertEq(usdc.balanceOf(creator), 4_750_000);
    }

    function test_revert_cancel_notTheMemberOrTwice() public {
        _join(_table());
        vm.prank(creator);
        vm.expectRevert(AmpedMemberships.NotMember.selector);
        mem.cancel(REF);
        vm.prank(member);
        mem.cancel(REF);
        vm.prank(member);
        vm.expectRevert(AmpedMemberships.NotActive.selector);
        mem.cancel(REF);
        vm.prank(member);
        vm.expectRevert(AmpedMemberships.UnknownSubscription.selector);
        mem.cancel(keccak256("nope"));
    }

    function test_cancelWithSignature_relayerSubmitsTheMembersCancel() public {
        _join(_table());
        uint64 deadline = uint64(block.timestamp + 600);
        bytes memory sig = _sign(memberPk, mem.hashCancel(REF, deadline));
        vm.expectEmit(address(mem));
        emit Canceled(REF, member, 1);
        vm.prank(relayer);
        mem.cancelWithSignature(REF, deadline, sig);
        assertFalse(mem.getSubscription(REF).active);
    }

    function test_revert_cancelWithSignature_wrongSignerOrExpired() public {
        _join(_table());
        uint64 deadline = uint64(block.timestamp + 600);
        bytes memory wrong = _sign(creatorPk, mem.hashCancel(REF, deadline));
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.InvalidCancelSignature.selector);
        mem.cancelWithSignature(REF, deadline, wrong);

        bytes memory sig = _sign(memberPk, mem.hashCancel(REF, deadline));
        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(AmpedMemberships.CancelExpired.selector);
        mem.cancelWithSignature(REF, deadline, sig);
    }

    function test_cancel_worksWhilePaused() public {
        _join(_table());
        vm.prank(pauser);
        mem.pause();
        uint64 deadline = uint64(block.timestamp + 600);
        bytes memory sig = _sign(memberPk, mem.hashCancel(REF, deadline));
        vm.prank(relayer);
        mem.cancelWithSignature(REF, deadline, sig);
        assertFalse(mem.getSubscription(REF).active);
    }

    function test_endByPlatform() public {
        _join(_table());
        vm.prank(stranger);
        vm.expectRevert();
        mem.endByPlatform(REF);
        vm.expectEmit(address(mem));
        emit Canceled(REF, member, 2);
        vm.prank(relayer);
        mem.endByPlatform(REF);
        assertFalse(mem.getSubscription(REF).active);
    }

    function test_rejoinUsesANewRef() public {
        _join(_table());
        vm.prank(member);
        mem.cancel(REF);
        bytes32 again = keccak256("membership-2");
        _join(_table(again, PRICE, DAYS_30, _basic()));
        assertTrue(mem.getSubscription(again).active);
    }

    // --------------------------------------------------------------- fuzz

    function testFuzz_join_sharesSumToPrice(uint256 price, uint16 platformBps, uint16 promoterBps, uint16 partnerBps)
        public
    {
        price = bound(price, mem.minPrice(), mem.maxPrice());
        platformBps = uint16(bound(platformBps, 500, 1_000));
        promoterBps = uint16(bound(promoterBps, 1, 2_000));
        partnerBps = uint16(bound(partnerBps, 1, 2_000));
        uint16 creatorBps = 10_000 - platformBps - promoterBps - partnerBps;

        AmpedMemberships.Recipient[] memory rs = new AmpedMemberships.Recipient[](4);
        rs[0] = _r(creator, creatorBps, 0);
        rs[1] = _r(treasury, platformBps, 1);
        rs[2] = _r(promoter, promoterBps, 2);
        rs[3] = _r(partner, partnerBps, 3);
        usdc.mint(member, price * 12);
        uint256 before = usdc.balanceOf(member);
        _join(_table(REF, price, DAYS_30, rs));

        uint256 total =
            usdc.balanceOf(creator) + usdc.balanceOf(treasury) + usdc.balanceOf(promoter) + usdc.balanceOf(partner);
        assertEq(total, price);
        assertEq(before - usdc.balanceOf(member), price);
        assertEq(usdc.balanceOf(treasury), (price * platformBps) / 10_000);
        assertEq(usdc.balanceOf(address(mem)), 0);
    }

    function testFuzz_renew_onlyInsideTheWindow(uint32 offset) public {
        _join(_table());
        uint64 due = mem.getSubscription(REF).nextDue;
        offset = uint32(bound(offset, 0, 10 days));
        vm.warp(due + offset);
        vm.prank(relayer);
        if (offset > 7 days) {
            vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.Lapsed.selector, due));
            mem.renew(REF);
        } else {
            mem.renew(REF);
            uint64 expected = offset <= 1 days ? due + DAYS_30 : uint64(due + offset + DAYS_30);
            assertEq(mem.getSubscription(REF).nextDue, expected);
        }
    }

    // ------------------------------------------------------- pause, limits

    function test_pause_onlyPauserAndUnpauseOnlySafe() public {
        bytes32 pauserRole = mem.PAUSER_ROLE();
        bytes32 adminRole = mem.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pauserRole)
        );
        mem.pause();
        vm.prank(pauser);
        mem.pause();
        vm.prank(pauser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, adminRole)
        );
        mem.unpause();
        vm.prank(safe);
        mem.unpause();
        assertFalse(mem.paused());
    }

    function test_setters_emitAndApply() public {
        vm.startPrank(safe);
        vm.expectEmit(address(mem));
        emit ParamChanged("renewGrace", 7 days, 10 days);
        mem.setRenewGrace(10 days);
        mem.setFeeFloorBps(600);
        mem.setMinCreatorBps(6_000);
        mem.setMaxRecipients(8);
        mem.setMaxJoinValidity(600);
        mem.setMinPrice(2e6);
        mem.setMaxPrice(100e6);
        mem.setSplitSigner(stranger);
        vm.stopPrank();
        assertEq(mem.renewGrace(), 10 days);
        assertEq(mem.feeFloorBps(), 600);
        assertEq(mem.minCreatorBps(), 6_000);
        assertEq(mem.maxRecipients(), 8);
        assertEq(mem.maxJoinValidity(), 600);
        assertEq(mem.minPrice(), 2e6);
        assertEq(mem.maxPrice(), 100e6);
        assertEq(mem.splitSigner(), stranger);
    }

    function test_revert_settersOutOfRange() public {
        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("feeFloorBps"), 1_001));
        mem.setFeeFloorBps(1_001);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("minCreatorBps"), 4_999));
        mem.setMinCreatorBps(4_999);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxRecipients"), 9));
        mem.setMaxRecipients(9);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxRecipients"), 1));
        mem.setMaxRecipients(1);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxJoinValidity"), 59));
        mem.setMaxJoinValidity(59);
        vm.expectRevert(
            abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxJoinValidity"), 86_401)
        );
        mem.setMaxJoinValidity(86_401);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("renewGrace"), 1 days - 1));
        mem.setRenewGrace(1 days - 1);
        vm.expectRevert(
            abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("renewGrace"), 30 days + 1)
        );
        mem.setRenewGrace(30 days + 1);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("minPrice"), 9_999));
        mem.setMinPrice(9_999);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("minPrice"), 5_001e6));
        mem.setMinPrice(5_001e6);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxPrice"), 1e6 - 1));
        mem.setMaxPrice(1e6 - 1);
        vm.expectRevert(abi.encodeWithSelector(AmpedMemberships.OutOfRange.selector, bytes32("maxPrice"), 10_000e6 + 1));
        mem.setMaxPrice(10_000e6 + 1);
        vm.expectRevert(AmpedMemberships.ZeroAddress.selector);
        mem.setTreasury(address(0));
        vm.expectRevert(AmpedMemberships.ZeroAddress.selector);
        mem.setSplitSigner(address(0));
        vm.stopPrank();
    }

    function test_revert_settersWrongRole() public {
        bytes32 paramsRole = mem.PARAMS_ROLE();
        bytes32 adminRole = mem.DEFAULT_ADMIN_ROLE();
        vm.startPrank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, paramsRole)
        );
        mem.setRenewGrace(2 days);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, adminRole)
        );
        mem.setTreasury(stranger);
        vm.stopPrank();
    }

    function test_upgradeOnlyBySafeThroughProxyAdmin() public {
        _join(_table());
        address newImpl = address(new AmpedMemberships(address(usdc)));
        vm.prank(stranger);
        vm.expectRevert();
        ProxyAdmin(proxyAdmin).upgradeAndCall(TransparentUpgradeableProxyLike(address(mem)), newImpl, "");

        vm.prank(safe);
        ProxyAdmin(proxyAdmin).upgradeAndCall(TransparentUpgradeableProxyLike(address(mem)), newImpl, "");
        assertTrue(mem.getSubscription(REF).active, "subscriptions survive the upgrade");
        assertEq(mem.renewGrace(), 7 days);
    }
}
