import { env } from "../env";
import { createWalletClient, createPublicClient, http, parseEther, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "@ampedbio/web3";
import { SIMPLE_BATCH_SEND_ABI } from "@ampedbio/web3";
import { prisma } from "./DB";

// Fixed chain ID for affiliate rewards (Libertas Testnet)
const AFFILIATES_CHAIN_ID = 73863;

interface ReferralRewardResult {
  success: boolean;
  txid?: string;
  error?: string;
}

/**
 * Send referral rewards to both referrer and referee using SimpleBatchSend contract
 * @param referrerAddress - Wallet address of the referrer
 * @param refereeAddress - Wallet address of the newly referred user
 * @returns Transaction hash or error details
 */
export async function sendReferralRewards(
  referrerAddress: Address,
  refereeAddress: Address
): Promise<ReferralRewardResult> {
  try {
    // Check if affiliate wallet is configured
    if (!env.AFFILIATES_PRIVATE_KEY) {
      return {
        success: false,
        error: "Affiliate wallet not configured",
      };
    }

    // Get chain config for Libertas Testnet
    const chain = getChainConfig(AFFILIATES_CHAIN_ID);
    if (!chain) {
      return {
        success: false,
        error: `Chain configuration not found for ID: ${AFFILIATES_CHAIN_ID}`,
      };
    }

    // Get contract address from chain config
    const contractAddress = chain.contracts?.SIMPLE_BATCH_SEND?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      return {
        success: false,
        error: "SimpleBatchSend contract address not configured in chain config",
      };
    }

    // Get reward amounts from SiteSettings
    const [referrerRewardSetting, refereeRewardSetting] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { setting_key: "affiliate_referrer_reward" },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: "affiliate_referee_reward" },
      }),
    ]);

    const referrerReward = referrerRewardSetting?.setting_value
      ? Number(referrerRewardSetting.setting_value)
      : null;
    const refereeReward = refereeRewardSetting?.setting_value
      ? Number(refereeRewardSetting.setting_value)
      : null;

    // If either reward amount is not configured, don't send rewards
    if (referrerReward === null || refereeReward === null) {
      return {
        success: false,
        error: "Reward amounts not configured in SiteSettings",
      };
    }

    // Validate reward amounts
    if (referrerReward <= 0 || refereeReward <= 0) {
      return {
        success: false,
        error: "Invalid reward amounts: must be greater than 0",
      };
    }

    // Create account from private key
    const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);

    // Create wallet and public clients
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    // Check wallet balance before sending
    const balance = await publicClient.getBalance({ address: account.address });
    const totalReward = referrerReward + refereeReward;
    const totalRewardInWei = parseEther(totalReward.toString());

    if (balance < totalRewardInWei) {
      return {
        success: false,
        error: `Insufficient balance: required ${totalReward} ${chain.nativeCurrency.symbol}, have ${balance} wei`,
      };
    }

    // Convert reward amounts to wei
    const referrerRewardInWei = parseEther(referrerReward.toString());
    const refereeRewardInWei = parseEther(refereeReward.toString());

    // Prepare recipients and amounts arrays
    const recipients: [Address, Address] = [referrerAddress, refereeAddress];
    const amounts: [bigint, bigint] = [referrerRewardInWei, refereeRewardInWei];

    console.log(
      `Sending referral rewards via SimpleBatchSend contract: ` +
      `${referrerReward} ${chain.nativeCurrency.symbol} to ${referrerAddress}, ` +
      `${refereeReward} ${chain.nativeCurrency.symbol} to ${refereeAddress}`
    );

    // Send transaction via SimpleBatchSend contract
    const hash = await walletClient.writeContract(
      {
        account,
        address: contractAddress,
        abi: SIMPLE_BATCH_SEND_ABI,
        functionName: "send",
        args: [recipients, amounts],
        value: totalRewardInWei,
      } as any
    );

    console.log(`Referral rewards transaction sent: ${hash}`);

    return {
      success: true,
      txid: hash,
    };
  } catch (error) {
    console.error("Error sending referral rewards:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update referral record with transaction ID
 * @param referralId - ID of the referral record
 * @param txid - Transaction hash from blockchain
 */
export async function updateReferralTxid(
  referralId: number,
  txid: string
): Promise<void> {
  await prisma.referral.update({
    where: { id: referralId },
    data: { txid },
  });
}
