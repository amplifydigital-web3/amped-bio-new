import { adminProcedure, router } from "../trpc";
import { env } from "../../env";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../../utils/chainConfig";

export const walletAdminRouter = router({
  getFaucetWalletInfo: adminProcedure.query(async () => {
    try {
      // Get chain configuration from centralized utility
      const chain = getChainConfig();

      // Create account from private key
      const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);

      // Create public client for fetching blockchain data
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      // Get wallet balance
      const balance = await publicClient.getBalance({ address: account.address });

      return {
        success: true,
        address: account.address,
        balance: balance,
        formattedBalance: balance.toString(),
        isMockMode: env.FAUCET_MOCK_MODE === "true",
        faucetAmount: Number(env.FAUCET_AMOUNT),
        currency: chain.nativeCurrency.symbol,
        chainId: chain.id,
        chainName: chain.name,
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
