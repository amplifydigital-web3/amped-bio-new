import { adminProcedure, router } from "../trpc";
import { env } from "../../env";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AVAILABLE_CHAINS } from "@ampedbio/web3";

export const walletAdminRouter = router({
  getFaucetWalletInfo: adminProcedure.query(async () => {
    if (!env.FAUCET_PRIVATE_KEY) {
      return {
        success: false,
        error: "Faucet not configured",
      };
    }
    try {
      // Create account from private key
      const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);

      const balances: Array<{
        chainId: number;
        chainName: string;
        currency: string;
        balance: bigint;
        formattedBalance: string;
      }> = [];

      const supportedChains = AVAILABLE_CHAINS;

      for (const chain of supportedChains) {
        try {
          // Create public client for fetching blockchain data
          const publicClient = createPublicClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          // Get wallet balance with timeout
          const balancePromise = publicClient.getBalance({ address: account.address });
          const timeoutPromise = new Promise<never>(
            (_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout while fetching balance for ${chain.name}`)),
                5000
              ) // Increased timeout to 5 seconds
          );
          const balance = await Promise.race([balancePromise, timeoutPromise]);

          balances.push({
            chainId: chain.id,
            chainName: chain.name,
            currency: chain.nativeCurrency.symbol,
            balance: balance,
            formattedBalance: balance.toString(),
          });
        } catch (chainError) {
          console.warn(
            `Could not fetch balance for chain ${chain.name} (ID: ${chain.id}):`,
            chainError
          );
          // Optionally, push an entry indicating failure for this chain
          balances.push({
            chainId: chain.id,
            chainName: chain.name,
            currency: chain.nativeCurrency.symbol,
            balance: BigInt(0), // Or some other indicator of failure
            formattedBalance: "N/A",
          });
        }
      }

      return {
        success: true,
        address: account.address,
        isMockMode: env.FAUCET_MOCK_MODE === "true",
        faucetAmount: Number(env.FAUCET_AMOUNT),
        balances,
      };
    } catch (error) {
      console.error("Error getting faucet wallet info:", error);
      return {
        success: false,
        error: "Failed to get faucet wallet information",
      };
    }
  }),
});
