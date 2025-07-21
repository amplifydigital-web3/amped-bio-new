import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { createWalletClient, http, parseEther, createPublicClient, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// User session storage for faucet claims (in-memory, will reset on server restart)
// Key is userId, value is timestamp of last claim
const faucetClaimRegistry = new Map<number, Date>();

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

// Create wallet client from private key
const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);

// Create wallet client for sending transactions
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(env.RPC_URL),
});

// Create public client for fetching blockchain data
const publicClient = createPublicClient({
  chain,
  transport: http(env.RPC_URL),
});

// Schema for requesting faucet tokens
const faucetRequestSchema = z.object({
  address: z.string().refine(address => address && isAddress(address), {
    message: "Invalid Ethereum address format",
  }),
});

// Schema for faucet response
const faucetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  transaction: z
    .object({
      id: z.string(),
      amount: z.number(),
      timestamp: z.date(),
      hash: z.string().optional(),
      mock: z.boolean().optional(), // Flag to indicate if this was a mock transaction
    })
    .optional(),
});

export const walletRouter = router({
  // Request faucet tokens using real blockchain transactions via viem
  requestAirdrop: privateProcedure
    .input(faucetRequestSchema)
    .output(faucetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check if user has requested faucet tokens in the last 24 hours
        const lastClaimTime = faucetClaimRegistry.get(userId);
        const now = new Date();

        if (lastClaimTime && now.getTime() - lastClaimTime.getTime() < 24 * 60 * 60 * 1000) {
          // Calculate when they can request again
          const nextAvailableTime = new Date(lastClaimTime.getTime() + 24 * 60 * 60 * 1000);

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You can only request faucet tokens once per day",
            cause: {
              code: "RATE_LIMIT_FAUCET",
              nextRequestAvailable: nextAvailableTime.toISOString(),
            },
          });
        }

        // Record the claim time
        faucetClaimRegistry.set(userId, now);

        try {
          // Use the faucet amount from environment variables
          const faucetAmount = Number(env.FAUCET_AMOUNT);
          const isMockMode = env.FAUCET_MOCK_MODE === "true";

          // Generate dummy transaction hash if in mock mode
          let hash;

          if (isMockMode) {
            // Create a dummy transaction hash
            hash = `0x${Array.from(
              { length: 64 },
              () => "0123456789abcdef"[Math.floor(Math.random() * 16)]
            ).join("")}`;

            console.log(
              `[MOCK MODE] Simulating sending ${faucetAmount} REVO from ${account.address} to ${input.address}`
            );
            console.log(`[MOCK MODE] Generated dummy transaction hash: ${hash}`);

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            // Real transaction flow
            // Convert the amount to wei
            const amountInWei = parseEther(faucetAmount.toString());

            console.log(`Sending ${faucetAmount} REVO from ${account.address} to ${input.address}`);

            // Send transaction using wallet client
            hash = await walletClient.sendTransaction({
              to: input.address as `0x${string}`,
              value: amountInWei,
            });

            // Wait for transaction to be mined
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: hash as `0x${string}`,
              timeout: 60_000, // 60 seconds timeout
            });
          }

          console.log(`${isMockMode ? "[MOCK] " : ""}Transaction confirmed: ${hash}`);

          // Create a transaction record
          const transaction = {
            id: hash, // Use the hash as the ID
            amount: faucetAmount,
            timestamp: now,
            hash,
            mock: isMockMode, // Include flag to indicate if this was a mock transaction
          };

          return {
            success: true,
            message: isMockMode
              ? `[MOCK MODE] Simulated sending ${faucetAmount} REVO tokens to ${input.address}`
              : `Successfully sent ${faucetAmount} REVO tokens to ${input.address}!`,
            transaction,
          };
        } catch (txError) {
          console.error("Failed to send transaction:", txError);

          // Remove the claim time since the transaction failed
          // Only reset the claim timer if we're not in mock mode (real transaction failed)
          if (env.FAUCET_MOCK_MODE !== "true") {
            faucetClaimRegistry.delete(userId);
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send transaction. Please try again later.",
          });
        }
      } catch (error) {
        console.error("Error processing airdrop request:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process airdrop request",
        });
      }
    }),
});
