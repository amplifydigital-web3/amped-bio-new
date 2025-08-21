import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { createWalletClient, http, parseEther, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "../services/DB";
import { getChainConfig } from "@repo/web3";

// Create public client for fetching blockchain data
// const publicClient = createPublicClient({
//   chain,
//   transport: http(chain.rpcUrls.default.http[0]),
// });

// Schema for requesting faucet tokens
const faucetRequestSchema = z.object({
  address: z.string().refine(address => address && isAddress(address), {
    message: "Invalid Ethereum address format",
  }),
  chainId: z.number(),
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
  // Link a wallet address to the current user (1:1 relationship)
  linkWalletAddress: privateProcedure
    .input(
      z.object({
        address: z.string().refine(address => address && isAddress(address), {
          message: "Invalid Ethereum address format",
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check if the user already has a linked wallet (1:1 relationship)
        const existingUserWallet = await prisma.userWallet.findFirst({
          where: { userId: userId },
        });

        if (existingUserWallet) {
          // If user already has a different wallet, we don't allow linking multiple wallets
          if (existingUserWallet.address !== input.address) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "You already have a wallet linked to your account. Only one wallet per user is allowed.",
            });
          }

          // If it's the same wallet, just return it
          return {
            success: true,
            message: "This wallet is already linked to your account",
            wallet: existingUserWallet,
          };
        }

        // Check if the address is already linked to any user
        const existingWalletAddress = await prisma.userWallet.findUnique({
          where: { address: input.address },
        });

        if (existingWalletAddress) {
          // If the wallet is linked to another user, throw an error
          throw new TRPCError({
            code: "CONFLICT",
            message: "This wallet address is already linked to another account",
          });
        }

        // Create a new wallet link
        const now = new Date();
        const newWallet = await prisma.userWallet.create({
          data: {
            address: input.address,
            userId: userId,
            created_at: now,
            updated_at: now,
          },
        });

        return {
          success: true,
          message: "Wallet address successfully linked to your account",
          wallet: newWallet,
        };
      } catch (error) {
        console.error("Error linking wallet address:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to link wallet address to user",
        });
      }
    }),

  // Get the current airdrop/faucet amount and user's last request info
  getFaucetAmount: privateProcedure
    .input(
      z.object({
        chainId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.user.sub;
        const chain = getChainConfig(input.chainId);

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid chain ID provided.",
          });
        }

        // Retrieve the faucet amount from environment variables
        const faucetAmount = Number(env.FAUCET_AMOUNT);

        // Find user's wallet and check their last airdrop request
        const userWallet = await prisma.userWallet.findFirst({
          where: { userId: userId },
        });

        let lastRequestDate: Date | null = null;
        let nextAvailableDate: Date | null = null;
        let canRequestNow = true;

        // If the user has a wallet and has requested an airdrop before
        if (userWallet && userWallet.last_airdrop_request) {
          lastRequestDate = userWallet.last_airdrop_request;

          // Check if it's been less than 24 hours since the last request
          const now = new Date();
          const timeSinceLastRequest = now.getTime() - lastRequestDate.getTime();
          const timeRequired = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

          if (timeSinceLastRequest < timeRequired) {
            // Calculate when they can request again
            nextAvailableDate = new Date(lastRequestDate.getTime() + timeRequired);
            canRequestNow = false;
          }
        }

        return {
          success: true,
          amount: faucetAmount,
          currency: chain.nativeCurrency.symbol,
          lastRequestDate,
          nextAvailableDate,
          canRequestNow,
          hasWallet: !!userWallet,
        };
      } catch (error) {
        console.error("Error getting faucet amount:", error);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve faucet amount",
        });
      }
    }),

  // Get the wallet address linked to the current user (1:1 relationship)
  getUserWallet: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    try {
      const wallet = await prisma.userWallet.findFirst({
        where: { userId: userId },
      });

      return {
        success: true,
        wallet: wallet || null,
        hasWallet: !!wallet,
      };
    } catch (error) {
      console.error("Error fetching user wallet:", error);

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve user wallet address",
      });
    }
  }),

  // Request faucet tokens using real blockchain transactions via viem
  requestAirdrop: privateProcedure
    .input(faucetRequestSchema)
    .output(faucetResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      if (!env.FAUCET_PRIVATE_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Faucet not configured",
        });
      }

      // Create wallet client from private key
      const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
      const chain = getChainConfig(input.chainId);

      if (!chain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid chain ID provided.",
        });
      }

      // Create wallet client for sending transactions
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      try {
        const now = new Date();

        // Find user's wallet (1:1 relationship - each user can have only one wallet)
        let wallet = await prisma.userWallet.findFirst({
          where: { userId: userId },
        });

        // If user doesn't have a linked wallet yet, check if address is available
        if (!wallet) {
          // Check if address is already linked to another user
          const existingAddress = await prisma.userWallet.findUnique({
            where: { address: input.address },
          });

          if (existingAddress) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This wallet address is already linked to another account",
            });
          }

          // Create new wallet link
          wallet = await prisma.userWallet.create({
            data: {
              address: input.address,
              userId,
              last_airdrop_request: now,
              created_at: now,
              updated_at: now,
            },
          });
        } else {
          // User has a wallet already, check if it's the same address
          if (wallet.address !== input.address) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This address doesn't match the wallet linked to your account",
            });
          }

          // Check if user has requested faucet tokens in the last 24 hours
          if (wallet.last_airdrop_request) {
            const lastClaimTime = wallet.last_airdrop_request;

            if (now.getTime() - lastClaimTime.getTime() < 24 * 60 * 60 * 1000) {
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
          }

          // Update the last airdrop request time
          wallet = await prisma.userWallet.update({
            where: { id: wallet.id },
            data: {
              last_airdrop_request: now,
              updated_at: now,
            },
          });
        }

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
              `[MOCK MODE] Simulating sending ${faucetAmount} ${chain.nativeCurrency.symbol} from ${account.address} to ${input.address}`
            );
            console.log(`[MOCK MODE] Generated dummy transaction hash: ${hash}`);

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            // Real transaction flow
            // Convert the amount to wei
            const amountInWei = parseEther(faucetAmount.toString());

            console.log(
              `Sending ${faucetAmount} ${chain.nativeCurrency.symbol} from ${account.address} to ${input.address}`
            );

            // Send transaction using wallet client and return immediately without waiting for confirmation
            hash = await walletClient.sendTransaction({
              to: input.address as `0x${string}`,
              value: amountInWei,
              chain,
            });

            // We no longer wait for the transaction to be mined
            console.log(`Transaction sent: ${hash} - Not waiting for confirmation`);
          }

          console.log(`${isMockMode ? "[MOCK] " : ""}Transaction sent: ${hash}`);

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
              ? `[MOCK MODE] Simulated sending ${faucetAmount} ${chain.nativeCurrency.symbol} tokens to ${input.address}`
              : `Transaction sent with ${faucetAmount} ${chain.nativeCurrency.symbol} tokens to ${input.address}! Waiting for network confirmation.`,
            transaction,
          };
        } catch (txError) {
          console.error("Failed to send transaction:", txError);

          // Reset the last_airdrop_request since the transaction failed
          // Only do this if we're not in mock mode (real transaction failed)
          if (env.FAUCET_MOCK_MODE !== "true" && wallet) {
            await prisma.userWallet.update({
              where: { id: wallet.id },
              data: { last_airdrop_request: null },
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to send transaction. The transaction could not be broadcast to the network. Please try again later.",
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
