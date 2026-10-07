import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "../env";
import { createPublicClient, http } from "viem";
import { getChainConfig } from "@repo/web3";
import { prisma } from "../services/DB";
import { SITE_SETTINGS, DAILY_AIRDROP_COOLDOWN_MS } from "@repo/constants";
import Decimal from "decimal.js";
import { processDailyAirdropClaim, calculateNextBatchTime, sendPendingBatch } from "../services/dailyAirdrop";
import { getAddress } from "viem/utils";
import * as jose from "jose";

// Reuse theme config schema from wallet.ts
const themeConfigSchema = z.object({
  background: z
    .object({
      type: z.enum(["color", "image", "video"]),
      value: z.string().nullable(),
      fileId: z.number().optional(),
    })
    .optional(),
});

async function getFaucetRequirements(userId: number) {
  const [user, linkBlockCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        image: true,
        image_file_id: true,
        description: true,
        theme: true,
      },
    }),
    prisma.block.count({
      where: { user_id: userId },
    }),
  ]);

  if (!user) {
    return { photo: false, background: false, bio: false, minLinks: false };
  }

  const hasPhoto = !!(user.image || user.image_file_id);

  let hasBackground = false;
  if (user.theme) {
    const themeRecord = await prisma.theme.findUnique({
      where: { id: Number(user.theme) },
      select: { config: true },
    });
    if (themeRecord?.config) {
      const parsed = themeConfigSchema.safeParse(themeRecord.config);
      if (parsed.success) {
        hasBackground = !!parsed.data.background?.type && (!!parsed.data.background?.value || !!parsed.data.background?.fileId);
      }
    }
  }

  const hasBio = (() => {
    if (!user.description) return false;
    const stripped = user.description.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
    return stripped.length > 0;
  })();
  const hasMinLinks = linkBlockCount >= 5;

  return { photo: hasPhoto, background: hasBackground, bio: hasBio, minLinks: hasMinLinks };
}

const JWKS = jose.createRemoteJWKSet(new URL("https://api-auth.web3auth.io/jwks"));

async function verifyWeb3AuthIdToken(idToken: string, appPubKey: string) {
  try {
    const { payload } = await jose.jwtVerify(idToken, JWKS, {
      algorithms: ["ES256"],
    });

    const wallets = (payload as any).wallets || [];
    const normalizedAppKey = appPubKey.toLowerCase().replace(/^0x/, "");

    const isValid = wallets.some((wallet: any) => {
      if (wallet.type !== "web3auth_app_key") return false;
      const walletKey = wallet.public_key.toLowerCase();
      if (walletKey === normalizedAppKey) return true;
      if (
        wallet.curve === "secp256k1" &&
        walletKey.length === 66 &&
        normalizedAppKey.length === 128
      ) {
        const compressedWithoutPrefix = walletKey.substring(2);
        return normalizedAppKey.startsWith(compressedWithoutPrefix);
      }
      return false;
    });

    if (!isValid) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Wallet address does not match the one in the ID token.",
      });
    }

    return payload;
  } catch (error) {
    console.error("ID token verification failed:", error);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid ID token.",
    });
  }
}

function web3AuthPublicKeyToAddress(publicKey: string): `0x${string}` {
  // Placeholder - same as in wallet.ts
  // Converts a Web3Auth public key to an Ethereum address
  const hash = publicKey.length >= 40 ? publicKey.substring(publicKey.length - 40) : publicKey;
  return (`0x${hash.toLowerCase()}`) as `0x${string}`;
}

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

        // Check if user has entry in queue
        if (userWallet && canRequestNow && hasSufficientFunds) {
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
          }

          // Check if user has zero balance (instant eligible)
          if (!queueEntry) {
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

        let wallet = await prisma.userWallet.findFirst({ where: { userId } });

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
              last_airdrop_request: now,
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

          const now = new Date();
          if (wallet.last_airdrop_request) {
            if (now.getTime() - wallet.last_airdrop_request.getTime() < DAILY_AIRDROP_COOLDOWN_MS) {
              const nextAvailableTime = new Date(
                wallet.last_airdrop_request.getTime() + DAILY_AIRDROP_COOLDOWN_MS
              );
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "You can claim the daily airdrop once daily",
                cause: { code: "RATE_LIMIT_FAUCET", nextRequestAvailable: nextAvailableTime.toISOString() },
              });
            }
          }

          // Check faucet balance
          if (env.FAUCET_MOCK_MODE !== "true" && env.FAUCET_PRIVATE_KEY) {
            const { privateKeyToAccount } = await import("viem/accounts");
            const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
            const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
            const balance = await publicClient.getBalance({ address: account.address });
            const balanceInEther = new Decimal(balance.toString()).div(new Decimal("10").pow(18)).toNumber();
            if (balanceInEther < Number(env.FAUCET_AMOUNT)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "The faucet does not have enough funds. Please try again later.",
              });
            }
          }
        }

        // Check profile requirements
        const requirements = await getFaucetRequirements(userId);
        if (!requirements.photo || !requirements.background || !requirements.bio || !requirements.minLinks) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Complete your profile to claim the daily airdrop.",
          });
        }

        // Process the claim
        const result = await processDailyAirdropClaim(userId, walletAddress, input.chainId);

        // Update last_airdrop_request for both instant and queued
        await prisma.userWallet.update({
          where: { id: wallet.id },
          data: { last_airdrop_request: new Date(), updated_at: new Date() },
        });

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