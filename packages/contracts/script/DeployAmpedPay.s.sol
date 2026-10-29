// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {AmpedPay} from "../src/AmpedPay.sol";

/// @notice Deploys AmpedPay behind a transparent proxy whose ProxyAdmin is owned by the Safe.
/// The deployer key gets no role. Spec docs/features/ampedpay.md 3.2 and 6.1.
///
/// Env (no defaults for addresses, so a missing value stops the deploy):
///   AMPEDPAY_SAFE          the environment's Safe (admin, params, pauser, upgrades)
///   AMPEDPAY_TREASURY      receives the platform share; the Safe in both environments
///   AMPEDPAY_SPLIT_SIGNER  Coinbase account that signs split tables
///   AMPEDPAY_RELAYER       Coinbase relayer account
///   AMPEDPAY_PAUSER        Coinbase pauser account (optional)
///   AMPEDPAY_USDC          only needed off Base and Base Sepolia
///
/// Base Sepolia:
///   forge script script/DeployAmpedPay.s.sol --rpc-url base_sepolia --account <deployer> --broadcast --verify
contract DeployAmpedPay is Script {
    address internal constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    function run() external returns (AmpedPay pay, address implementation, address proxyAdmin) {
        address safe = vm.envAddress("AMPEDPAY_SAFE");
        address treasury = vm.envAddress("AMPEDPAY_TREASURY");
        address splitSigner = vm.envAddress("AMPEDPAY_SPLIT_SIGNER");
        address relayer = vm.envAddress("AMPEDPAY_RELAYER");
        address pauser = vm.envOr("AMPEDPAY_PAUSER", address(0));
        address usdc = _usdc();

        vm.startBroadcast();
        implementation = address(new AmpedPay(usdc));
        bytes memory init = abi.encodeCall(AmpedPay.initialize, (safe, treasury, splitSigner, relayer, pauser));
        pay = AmpedPay(address(new TransparentUpgradeableProxy(implementation, safe, init)));
        vm.stopBroadcast();

        proxyAdmin = address(uint160(uint256(vm.load(address(pay), ADMIN_SLOT))));

        // Post deploy checks. A failure here means the addresses or roles are wrong.
        require(ProxyAdmin(proxyAdmin).owner() == safe, "ProxyAdmin is not owned by the Safe");
        require(pay.hasRole(pay.DEFAULT_ADMIN_ROLE(), safe), "Safe lacks admin");
        require(pay.hasRole(pay.PARAMS_ROLE(), safe), "Safe lacks params");
        require(pay.hasRole(pay.RELAYER_ROLE(), relayer), "relayer lacks role");
        require(!pay.hasRole(pay.DEFAULT_ADMIN_ROLE(), msg.sender), "deployer must hold no role");
        require(address(pay.usdc()) == usdc, "wrong USDC");

        console2.log("chain id        ", block.chainid);
        console2.log("AmpedPay (proxy)", address(pay));
        console2.log("implementation  ", implementation);
        console2.log("ProxyAdmin      ", proxyAdmin);
        console2.log("Safe            ", safe);
        console2.log("treasury        ", treasury);
        console2.log("split signer    ", splitSigner);
        console2.log("relayer         ", relayer);
        console2.log("pauser          ", pauser);
        console2.log("USDC            ", usdc);
    }

    function _usdc() internal view returns (address) {
        if (block.chainid == 8453) return USDC_BASE;
        if (block.chainid == 84532) return USDC_BASE_SEPOLIA;
        return vm.envAddress("AMPEDPAY_USDC");
    }
}
