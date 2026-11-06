import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { createPublicClient, http } from "viem";
import { getChainConfig } from "@repo/web3";
import { prisma } from "../services/DB";
import { SITE_SETTINGS, DAILY_AIRDROP_COOLDOWN_MS } from "@repo/constants";
import Decimal from "decimal.js";
import {
  AirdropSendUnknownError,
  processDailyAirdropClaim,
  calculateNextBatchTime,
} from "../services/dailyAirdrop";
import {
  getFaucetRequirements,
  verifyWeb3AuthIdToken,
  web3AuthPublicKeyToAddress,
} from "./wallet";
import { getAddress } from "viem/utils";

// Reuse theme config schema from wallet.ts

export const dailyAirdropRouter = router({
  getDailyAirdropInfo: privateProcedure
    .input(
      z.object({
        chainId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.user!.sub;
        const chain = getChainConfig(input.chainId);

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid chain ID provided.",
          });
        }

        // Check if faucet is enabled globally
        const faucetStatus = await prisma.siteSettings.findUnique({
          where: { setting_key: SITE_SETTINGS.FAUCET_ENABLED },
        });
        const faucetEnabled = faucetStatus?.setting_value === "true";

        if (!faucetEnabled) {
          return {
            amount: 0,
            currency: chain.nativeCurrency.symbol,
            lastRequestDate: null,
            nextAvailableDate: null,
            canRequestNow: false,
            hasWallet: false,
            hasSufficientFunds: false,
            faucetEnabled: false,
            requirements: { photo: false, background: false, bio: false, minLinks: false },
            isInstant: false,
            userQueueStatus: null,
            estimatedBatchTime: null,
          };
        }

        const faucetAmount = Number(env.FAUCET_AMOUNT);
        let hasSufficientFunds = true;

        if (env.FAUCET_MOCK_MODE !== "true") {
          if (!env.FAUCET_PRIVATE_KEY) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Faucet not configured",
            });
          }

          const publicClient = createPublicClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          const { privateKeyToAccount } = await import("viem/accounts");
          const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
          const balance = await publicClient.getBalance({ address: account.address });
          const balanceInEther = new Decimal(balance.toString()).div(new Decimal("10").pow(18)).toNumber();

          if (balanceInEther < faucetAmount) {
            hasSufficientFunds = false;
          }
        }

        // Find user's wallet
        const userWallet = await prisma.userWallet.findFirst({
          where: { userId },
        });

        let lastRequestDate: Date | null = null;
        let nextAvailableDate: Date | null = null;
        let canRequestNow = true;
        let isInstant = false;
        let queueStatus: {
          position: number;
          totalInBatch: number;
          estimatedTime: string;
        } | null = null;

        // Check cooldown
        if (userWallet && userWallet.last_airdrop_request) {
          lastRequestDate = userWallet.last_airdrop_request;
          const now = new Date();
          const timeSinceLastRequest = now.getTime() - lastRequestDate.getTime();
          const timeRequired = DAILY_AIRDROP_COOLDOWN_MS;

          if (timeSinceLastRequest < timeRequired) {
            nextAvailableDate = new Date(lastRequestDate.getTime() + timeRequired);
            canRequestNow = false;
          }
        }

        // A queued entry is the source of truth for the fan's state: it is
        // returned even during the cooldown, so the client never reports
        // "already sent" while the claim still sits in the batch
        if (userWallet) {
          const queueEntry = await prisma.airdropQueueEntry.findUnique({
            where: { userWalletId: userWallet.id },
          });

          if (queueEntry) {
            const position = await prisma.airdropQueueEntry.count({
              where: { createdAt: { lte: queueEntry.createdAt } },
            });
            const totalInBatch = await prisma.airdropQueueEntry.count();
            queueStatus = {
              position,
              totalInBatch,
              estimatedTime: calculateNextBatchTime(),
            };
          } else if (canRequestNow && hasSufficientFunds) {
            // Check if user has zero balance (instant eligible)
            const publicClient = createPublicClient({
              chain,
              transport: http(chain.rpcUrls.default.http[0]),
            });

            try {
              const balance = await publicClient.getBalance({ address: userWallet.address as `0x${string}` });
              isInstant = balance === 0n;
            } catch {
              // If balance check fails, default to batch
              isInstant = false;
            }
          }
        }

        return {
          amount: faucetAmount,
          currency: chain.nativeCurrency.symbol,
          lastRequestDate,
          nextAvailableDate,
          canRequestNow,
          hasWallet: !!userWallet,
          hasSufficientFunds,
          faucetEnabled,
          requirements: await getFaucetRequirements(userId),
          isInstant,
          userQueueStatus: queueStatus,
          estimatedBatchTime: calculateNextBatchTime(),
        };
      } catch (error) {
        console.error("Error getting daily airdrop info:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve daily airdrop information",
        });
      }
    }),

  claimDailyAirdrop: privateProcedure
    .input(
      z.object({
        publicKey: z.string(),
        chainId: z.number(),
        idToken: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.user!.sub;

        let walletAddress: `0x${string}`;

        if (env.APP_ENV === "development" && input.address) {
          walletAddress = getAddress(input.address as `0x${string}`);
        } else {
          if (!input.idToken) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Web3Auth ID token is required",
            });
          }
          await verifyWeb3AuthIdToken(input.idToken, input.publicKey);
          walletAddress = web3AuthPublicKeyToAddress(input.publicKey);
        }

        // Find or create wallet, check cooldown (same logic as wallet.ts)
        const chain = getChainConfig(input.chainId);
        if (!chain) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid chain ID" });
        }

        // Kill switch: refuse even when the client still shows the button.
        const faucetStatus = await prisma.siteSettings.findUnique({
          where: { setting_key: SITE_SETTINGS.FAUCET_ENABLED },
        });
        if (faucetStatus?.setting_value !== "true") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The faucet is currently disabled.",
          });
        }

        let wallet = await prisma.userWallet.findFirst({ where: { userId } });
        // The cooldown value before this claim, restored only when the send
        // provably never reached the chain.
        let previousRequest: Date | null = null;

        if (!wallet) {
          const existingAddress = await prisma.userWallet.findUnique({
            where: { address: walletAddress },
          });
          if (existingAddress) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This wallet address is already linked to another account.",
            });
          }

          const now = new Date();
          wallet = await prisma.userWallet.create({
            data: {
              address: walletAddress,
              userId,
              created_at: now,
              updated_at: now,
            },
          });
        } else {
          if (wallet.address !== walletAddress) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This address doesn't match the wallet linked to your account",
            });
          }

          previousRequest = wallet.last_airdrop_request;

          const now = new Date();
          if (previousRequest) {
            if (now.getTime() - previousRequest.getTime() < DAILY_AIRDROP_COOLDOWN_MS) {
              const nextAvailableTime = new Date(
                previousRequest.getTime() + DAILY_AIRDROP_COOLDOWN_MS
              );
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "You can claim the daily airdrop once daily",
                cause: { code: "RATE_LIMIT_FAUCET", nextRequestAvailable: nextAvailableTime.toISOString() },
              });
            }
          }
        }

        // Check profile requirements before anything is consumed
        const requirements = await getFaucetRequirements(userId);
        if (!requirements.photo || !requirements.background || !requirements.bio || !requirements.minLinks) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Complete your profile to claim the daily airdrop.",
          });
        }

        // Claim the cooldown optimistically: the conditional update wins for
        // exactly one concurrent request, so two racing claims cannot both
        // pass the cooldown check and double the send
        const now = new Date();
        const claim = await prisma.userWallet.updateMany({
          where: { id: wallet.id, last_airdrop_request: previousRequest },
          data: { last_airdrop_request: now, updated_at: now },
        });
        if (claim.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You can claim the daily airdrop once daily",
          });
        }

        // Check faucet balance for every claim, first time wallets included
        if (env.FAUCET_MOCK_MODE !== "true" && env.FAUCET_PRIVATE_KEY) {
          const { privateKeyToAccount } = await import("viem/accounts");
          const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
          const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
          const balance = await publicClient.getBalance({ address: account.address });
          const balanceInEther = new Decimal(balance.toString()).div(new Decimal("10").pow(18)).toNumber();
          if (balanceInEther < Number(env.FAUCET_AMOUNT)) {
            await prisma.userWallet.update({
              where: { id: wallet.id },
              data: { last_airdrop_request: previousRequest, updated_at: new Date() },
            });
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "The faucet does not have enough funds. Please try again later.",
            });
          }
        }

        // Process the claim. Only a failure that proves nothing was broadcast
        // gives the cooldown back: a timeout may have paid the fan already, so
        // keeping the cooldown prevents a retry from paying twice.
        let result;
        try {
          result = await processDailyAirdropClaim(userId, walletAddress, input.chainId);
        } catch (error) {
          if (error instanceof AirdropSendUnknownError) {
            console.error("Airdrop send outcome unknown:", error.cause);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Your reward may still arrive. Check your wallet before trying again.",
            });
          }

          await prisma.userWallet.update({
            where: { id: wallet.id },
            data: { last_airdrop_request: previousRequest, updated_at: new Date() },
          });
          throw error;
        }

        return {
          success: true,
          status: result.status,
          txid: result.txid,
          position: result.position,
          totalInBatch: result.totalInBatch,
          estimatedTime: result.estimatedTime,
          message:
            result.status === "instant"
              ? `Your ${result.amount} ${result.currency} has arrived instantly!`
              : `Added to batch queue. Position #${result.position} of ${result.totalInBatch}. Estimated arrival: ${new Date(result.estimatedTime!).toLocaleString()}.`,
          amount: result.amount,
          currency: result.currency,
        };
      } catch (error) {
        console.error("Error claiming daily airdrop:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to claim daily airdrop",
        });
      }
    }),
});