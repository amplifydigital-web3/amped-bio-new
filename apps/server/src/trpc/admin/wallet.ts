import { adminProcedure, router } from "../trpc";
import { env } from "../../env";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const walletAdminRouter = router({
  getFaucetWalletInfo: adminProcedure.query(async () => {
    try {
      // Create chain configuration from environment
      const chain = {
        id: Number(env.CHAIN_ID),
        name: "Revolution Chain",
        network: "revolution",
        nativeCurrency: {
          decimals: 18,
          name: "REVO",
          symbol: "REVO",
        },
        rpcUrls: {
          default: { http: [env.RPC_URL] },
          public: { http: [env.RPC_URL] },
        },
      };

      // Create account from private key
      const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);

      // Create public client for fetching blockchain data
      const publicClient = createPublicClient({
        chain,
        transport: http(env.RPC_URL),
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
        currency: "REVO",
        chainId: Number(env.CHAIN_ID),
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
