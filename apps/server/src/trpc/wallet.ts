import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

// User session storage for faucet claims (in-memory, will reset on server restart)
// This is a simple implementation that doesn't use the database
// Key is userId, value is timestamp of last claim
const faucetClaimRegistry = new Map<number, Date>();

// Schema for requesting faucet tokens
const faucetRequestSchema = z.object({
  amount: z.number().min(1).optional().default(100), // Default to 100 tokens if not specified
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
    })
    .optional(),
});

// Helper function to generate a mock transaction hash
const generateMockTxHash = () => {
  return `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;
};

// Helper function to generate a mock transaction ID
const generateMockId = () => {
  return Date.now().toString() + Math.floor(Math.random() * 10000).toString();
};

export const walletRouter = router({
  // Request faucet tokens (completely dummy implementation)
  requestAirdrop: privateProcedure
    .input(faucetRequestSchema)
    .output(faucetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check if user has requested faucet tokens in the last 24 hours
        const lastClaimTime = faucetClaimRegistry.get(userId);
        const now = new Date();
        
        if (lastClaimTime && (now.getTime() - lastClaimTime.getTime() < 24 * 60 * 60 * 1000)) {
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

        // Generate mock transaction data
        const mockTxHash = generateMockTxHash();
        const mockId = generateMockId();

        // Create a dummy transaction record
        const transaction = {
          id: mockId,
          amount: input.amount,
          timestamp: now,
          hash: mockTxHash
        };

        return {
          success: true,
          message: `Successfully sent ${input.amount} REVO tokens to your wallet!`,
          transaction,
        };
      } catch (error: any) {
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

  // Get airdrop history for the current user
  getAirdropHistory: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    try {
      const airdrops = await prisma.airdrop.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        success: true,
        airdrops: airdrops.map(airdrop => ({
          id: airdrop.id.toString(),
          amount: airdrop.amount,
          timestamp: airdrop.createdAt,
          hash: airdrop.transactionHash,
        })),
      };
    } catch (error: any) {
      console.error("Error fetching airdrop history:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch airdrop history",
      });
    }
  }),
});
