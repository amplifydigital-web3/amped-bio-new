import { env } from "../env";
import { createWalletClient, createPublicClient, http, parseEther, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "@ampedbio/web3";
import { SIMPLE_BATCH_SEND_ABI } from "@ampedbio/web3";
import { prisma } from "./DB";
import { AFFILIATES_CHAIN_ID, SITE_SETTINGS } from "@ampedbio/constants";

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
  const startTime = Date.now();

  console.log(
    `[SEND_REFERRAL_REWARDS_START] referrer=${referrerAddress}, referee=${refereeAddress}`
  );

  try {
    if (!env.AFFILIATES_PRIVATE_KEY) {
      console.log(
        `[AFFILIATE_WALLET_NOT_CONFIGURED] referrer=${referrerAddress}, referee=${refereeAddress}`
      );
      return {
        success: false,
        error: "Affiliate wallet not configured",
      };
    }

    const chain = getChainConfig(AFFILIATES_CHAIN_ID);
    if (!chain) {
      console.log(
        `[CHAIN_CONFIG_NOT_FOUND] chainId=${AFFILIATES_CHAIN_ID}, referrer=${referrerAddress}, referee=${refereeAddress}`
      );
      return {
        success: false,
        error: `Chain configuration not found for ID: ${AFFILIATES_CHAIN_ID}`,
      };
    }

    const contractAddress = chain.contracts?.SIMPLE_BATCH_SEND?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      console.log(
        `[CONTRACT_ADDRESS_NOT_CONFIGURED] chainId=${AFFILIATES_CHAIN_ID}, referrer=${referrerAddress}, referee=${refereeAddress}`
      );
      return {
        success: false,
        error: "SimpleBatchSend contract address not configured in chain config",
      };
    }

    const [referrerRewardSetting, refereeRewardSetting] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFERRER_REWARD },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD },
      }),
    ]);

    const referrerReward = referrerRewardSetting?.setting_value
      ? Number(referrerRewardSetting.setting_value)
      : null;
    const refereeReward = refereeRewardSetting?.setting_value
      ? Number(refereeRewardSetting.setting_value)
      : null;

    console.log(
      `[REWARD_AMOUNTS_FETCHED] referrerReward=${referrerReward}, refereeReward=${refereeReward}`
    );

    if (referrerReward === null || refereeReward === null) {
      console.log(
        `[REWARD_AMOUNTS_NOT_CONFIGURED] referrerReward=${referrerReward}, refereeReward=${refereeReward}`
      );
      return {
        success: false,
        error: "Reward amounts not configured in SiteSettings",
      };
    }

    if (referrerReward <= 0 || refereeReward <= 0) {
      console.log(
        `[INVALID_REWARD_AMOUNTS] referrerReward=${referrerReward}, refereeReward=${refereeReward}`
      );
      return {
        success: false,
        error: "Invalid reward amounts: must be greater than 0",
      };
    }

    const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);

    console.log(`[AFFILIATE_WALLET_ACCOUNT_CREATED] accountAddress=${account.address}`);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const balance = await publicClient.getBalance({ address: account.address });
    const totalReward = referrerReward + refereeReward;
    const totalRewardInWei = parseEther(totalReward.toString());

    console.log(
      `[AFFILIATE_WALLET_BALANCE_CHECKED] accountAddress=${account.address}, balance=${balance.toString()}, balanceInEther=${(Number(balance) / 1e18).toFixed(6)}, totalRewardRequired=${totalReward}`
    );

    if (balance < totalRewardInWei) {
      console.log(
        `[INSUFFICIENT_WALLET_BALANCE] accountAddress=${account.address}, balance=${balance.toString()}, required=${totalRewardInWei.toString()}`
      );
      return {
        success: false,
        error: `Insufficient balance: required ${totalReward} ${chain.nativeCurrency.symbol}, have ${balance} wei`,
      };
    }

    const referrerRewardInWei = parseEther(referrerReward.toString());
    const refereeRewardInWei = parseEther(refereeReward.toString());

    const recipients: [Address, Address] = [referrerAddress, refereeAddress];
    const amounts: [bigint, bigint] = [referrerRewardInWei, refereeRewardInWei];

    console.log(
      `[SENDING_REFERRAL_REWARDS] contractAddress=${contractAddress}, referrerReward=${referrerReward}, refereeReward=${refereeReward}, totalReward=${totalReward}, chainId=${chain.id}`
    );

    const hash = await walletClient.writeContract({
      account,
      address: contractAddress,
      abi: SIMPLE_BATCH_SEND_ABI,
      functionName: "send",
      args: [recipients, amounts],
      value: totalRewardInWei,
    } as any);

    const duration = Date.now() - startTime;

    console.log(
      `[REFERRAL_REWARDS_TRANSACTION_SENT] txid=${hash}, referrer=${referrerAddress}, referee=${refereeAddress}, referrerReward=${referrerReward}, refereeReward=${refereeReward}, durationMs=${duration}`
    );

    return {
      success: true,
      txid: hash,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    console.log(
      `[SEND_REFERRAL_REWARDS_ERROR] referrer=${referrerAddress}, referee=${refereeAddress}, error=${errorMessage}, durationMs=${duration}`
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}
