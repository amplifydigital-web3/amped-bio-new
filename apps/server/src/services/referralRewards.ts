import { parseEther, Address, WalletClient, PublicClient } from "viem";
import { SIMPLE_BATCH_SEND_ABI } from "@ampedbio/web3";

interface FindTransactionResult {
  txid?: string;
  blockNumber?: bigint;
  timestamp?: number;
}

interface ReferralRewardResult {
  success: boolean;
  txid?: string;
  error?: string;
}

/**
 * Check if a pair has already been sent rewards
 * @param publicClient - Viem public client instance
 * @param contractAddress - Contract address
 * @param referrerAddress - Wallet address of the referrer
 * @param refereeAddress - Wallet address of the referee
 * @returns True if the pair has been sent, false otherwise
 */
async function checkPairAlreadySent(
  publicClient: any,
  contractAddress: Address,
  referrerAddress: Address,
  refereeAddress: Address
): Promise<boolean> {
  const alreadySent = await publicClient.readContract({
    address: contractAddress,
    abi: SIMPLE_BATCH_SEND_ABI,
    functionName: "hasPairBeenSent",
    args: [referrerAddress, refereeAddress],
  });

  return alreadySent as boolean;
}

/**
 * Find the transaction hash for a referral pair by querying the revoscan.io API
 * to get the first transaction of the referee's wallet
 * @param refereeAddress - Wallet address of the referee to search for
 * @returns Transaction hash and block number if found
 */
async function findReferralTransaction(refereeAddress: Address): Promise<FindTransactionResult> {
  try {
    console.log(`[FIND_REFERRAL_TX_START] referee=${refereeAddress}`);

    // Get current date for toDate parameter
    const now = new Date();
    const toDate = now.toISOString();

    // Query the address transfers endpoint
    const url = `https://api.libertas.revoscan.io/address/${refereeAddress}/transfers?toDate=${encodeURIComponent(toDate)}&limit=10&page=1`;

    console.log(`[FIND_REFERRAL_TX_URL] url=${url}`);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log(
        `[FIND_REFERRAL_TX_NOT_FOUND] No transactions found for referee=${refereeAddress}`
      );
      return {};
    }

    // Get the first transaction from the items array
    const firstTx = data.items[0];

    console.log(
      `[FIND_REFERRAL_TX_FOUND] txid=${firstTx.transactionHash}, blockNumber=${firstTx.blockNumber}, referee=${refereeAddress}`
    );

    return {
      txid: firstTx.transactionHash,
      blockNumber: BigInt(firstTx.blockNumber),
      timestamp: new Date(firstTx.timestamp).getTime(),
    };
  } catch (error) {
    console.error(
      `[FIND_REFERRAL_TX_ERROR] referee=${refereeAddress}, error=${error instanceof Error ? error.message : "Unknown error"}`
    );
    return {};
  }
}

/**
 * Send referral rewards to both referrer and referee using SimpleBatchSend contract
 * @param walletClient - Viem wallet client for sending transactions
 * @param publicClient - Viem public client for reading blockchain data
 * @param contractAddress - Address of the SimpleBatchSend contract
 * @param referrerAddress - Wallet address of the referrer
 * @param refereeAddress - Wallet address of the newly referred user
 * @param referrerReward - Amount to reward the referrer (in ETH)
 * @param refereeReward - Amount to reward the referee (in ETH)
 * @returns Transaction hash or error details
 */
export async function sendReferralRewards(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  referrerAddress: Address,
  refereeAddress: Address,
  referrerReward: number,
  refereeReward: number
): Promise<ReferralRewardResult> {
  const startTime = Date.now();

  console.log(
    `[SEND_REFERRAL_REWARDS_START] referrer=${referrerAddress}, referee=${refereeAddress}`
  );

  try {
    if (!walletClient.account) {
      return {
        success: false,
        error: "Wallet client account is not configured",
      };
    }

    const balance = await publicClient.getBalance({ address: walletClient.account.address });
    const totalReward = referrerReward + refereeReward;
    const totalRewardInWei = parseEther(totalReward.toString());

    console.log(
      `[AFFILIATE_WALLET_BALANCE_CHECKED] accountAddress=${walletClient.account.address}, balance=${balance.toString()}, balanceInEther=${(Number(balance) / 1e18).toFixed(6)}, totalRewardRequired=${totalReward}`
    );

    if (balance < totalRewardInWei) {
      console.log(
        `[INSUFFICIENT_WALLET_BALANCE] accountAddress=${walletClient.account.address}, balance=${balance.toString()}, required=${totalRewardInWei.toString()}`
      );
      return {
        success: false,
        error: `Insufficient balance: required ${totalReward}, have ${balance} wei`,
      };
    }

    const referrerRewardInWei = parseEther(referrerReward.toString());
    const refereeRewardInWei = parseEther(refereeReward.toString());

    const recipients: [Address, Address] = [referrerAddress, refereeAddress];
    const amounts: [bigint, bigint] = [referrerRewardInWei, refereeRewardInWei];

    console.log(
      `[SENDING_REFERRAL_REWARDS] contractAddress=${contractAddress}, referrerReward=${referrerReward}, refereeReward=${refereeReward}, totalReward=${totalReward}`
    );

    const hash = await walletClient.writeContract({
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

    // Check if error is related to nonce issues
    const isNonceError = errorMessage.toLowerCase().includes("nonce");

    console.log(
      `[SEND_REFERRAL_REWARDS_ERROR] referrer=${referrerAddress}, referee=${refereeAddress}, error=${errorMessage}, durationMs=${duration}`
    );

    // Return user-friendly message for nonce errors
    if (isNonceError) {
      return {
        success: false,
        error: "Transaction failed. Please try again in a few seconds.",
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export { findReferralTransaction, checkPairAlreadySent };
