import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "../env";
import {
  createWalletClient,
  http,
  parseEther,
  Address,
  createPublicClient,
  formatEther,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem/utils";
import { prisma } from "../services/DB";
import { getChainConfig } from "@ampedbio/web3";
import * as jose from "jose";

// Schema for requesting faucet tokens
const faucetRequestSchema = z.object({
  publicKey: z.string(),
  chainId: z.number(),
  idToken: z.string(),
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

const JWKS = jose.createRemoteJWKSet(new URL("https://api-auth.web3auth.io/jwks"));

// taken from https://web3auth.io/docs/authentication/id-token#using-jwks-endpoint
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

      // Direct key comparison for ed25519 keys
      if (walletKey === normalizedAppKey) return true;

      // Handle compressed secp256k1 keys
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

export const walletRouter = router({
  // Link a wallet address to the current user (1:1 relationship)
  linkWalletAddress: privateProcedure
    .input(
      z.object({
        publicKey: z.string(),
        idToken: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      // Verify the Web3Auth ID token and get the wallet address
      await verifyWeb3AuthIdToken(input.idToken, input.publicKey);

      // Convert the public key to an Ethereum address
      const address = web3AuthPublicKeyToAddress(input.publicKey);

      try {
        // Check if the user already has a linked wallet (1:1 relationship)
        const existingUserWallet = await prisma.userWallet.findFirst({
          where: { userId: userId },
        });

        if (existingUserWallet) {
          // If user already has a different wallet, we don't allow linking multiple wallets
          if (existingUserWallet.address !== address) {
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
          where: { address: address },
        });

        if (existingWalletAddress) {
          // If the wallet is linked to another user, return an error.
          throw new TRPCError({
            code: "CONFLICT",
            message: "This wallet address is already linked to another account.",
          });
        }

        // Create a new wallet link
        const now = new Date();
        const newWallet = await prisma.userWallet.create({
          data: {
            address: address,
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

        // Retrieve the faucet enabled status
        const faucetStatus = await prisma.siteSettings.findUnique({
          where: { setting_key: "faucet_enabled" },
        });
        const faucetEnabled = faucetStatus?.setting_value === "true";

        // If faucet is disabled, return early with relevant info
        if (!faucetEnabled) {
          return {
            amount: 0,
            currency: chain.nativeCurrency.symbol,
            lastRequestDate: null,
            nextAvailableDate: null,
            canRequestNow: false,
            hasWallet: false,
            hasSufficientFunds: false,
            faucetEnabled: false, // Indicate that the faucet is disabled
          };
        }

        // Retrieve the faucet amount from environment variables
        const faucetAmount = Number(env.FAUCET_AMOUNT);
        let hasSufficientFunds = true; // Assume true by default

        // If not in mock mode, check the actual balance of the faucet
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

          const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
          const balance = await publicClient.getBalance({ address: account.address });
          const balanceInEther = parseFloat(formatEther(balance));

          // Check if the faucet has enough balance for the airdrop
          if (balanceInEther < faucetAmount) {
            hasSufficientFunds = false;
          }
        }

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
          amount: faucetAmount,
          currency: chain.nativeCurrency.symbol,
          lastRequestDate,
          nextAvailableDate,
          canRequestNow,
          hasWallet: !!userWallet,
          hasSufficientFunds, // Return the flag to the client
          faucetEnabled, // Return the faucet enabled status
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
      try {
        const userId = ctx.user.sub;

        // Verify the Web3Auth ID token and get the wallet address
        await verifyWeb3AuthIdToken(input.idToken, input.publicKey);

        const address = web3AuthPublicKeyToAddress(input.publicKey);

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

        // If not in mock mode, check the actual balance of the faucet
        if (env.FAUCET_MOCK_MODE !== "true") {
          const publicClient = createPublicClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          const balance = await publicClient.getBalance({ address: account.address });
          const balanceInEther = parseFloat(formatEther(balance));
          const faucetAmount = Number(env.FAUCET_AMOUNT);

          // Check if the faucet has enough balance for the airdrop
          if (balanceInEther < faucetAmount) {
            throw new TRPCError({
              code: "FORBIDDEN", // Custom error code for insufficient funds
              message:
                "The faucet does not have enough funds to complete this transaction. Please try again later.",
            });
          }
        }

        const now = new Date();

        // Find user's wallet (1:1 relationship - each user can have only one wallet)
        let wallet = await prisma.userWallet.findFirst({
          where: { userId: userId },
        });

        // If user doesn't have a linked wallet yet, check if address is available
        if (!wallet) {
          // Check if address is already linked to another user
          const existingAddress = await prisma.userWallet.findUnique({
            where: { address: address },
          });

          if (existingAddress) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This wallet address is already linked to another account.",
            });
          }

          // Create new wallet link
          wallet = await prisma.userWallet.create({
            data: {
              address: address,
              userId,
              last_airdrop_request: now,
              created_at: now,
              updated_at: now,
            },
          });
        } else {
          // User has a wallet already, check if it's the same address
          if (wallet.address !== address) {
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
              `[MOCK MODE] Simulating sending ${faucetAmount} ${chain.nativeCurrency.symbol} from ${account.address} to ${address}`
            );
            console.log(`[MOCK MODE] Generated dummy transaction hash: ${hash}`);

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            // Real transaction flow
            // Convert the amount to wei
            const amountInWei = parseEther(faucetAmount.toString());

            console.log(
              `Sending ${faucetAmount} ${chain.nativeCurrency.symbol} from ${account.address} to ${address}`
            );

            // Send transaction using wallet client and return immediately without waiting for confirmation
            hash = await walletClient.sendTransaction({
              to: address,
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
              ? `[MOCK MODE] Simulated sending ${faucetAmount} ${chain.nativeCurrency.symbol} tokens to ${address}`
              : `Transaction sent with ${faucetAmount} ${chain.nativeCurrency.symbol} tokens to ${address}! Waiting for network confirmation.`,
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

  // Search users by onelink or wallet address
  searchUsers: privateProcedure
    .input(z.string()) // Input is the search query
    .query(async ({ input }) => {
      const searchQuery = input.toLowerCase(); // Case-insensitive search

      const users = await prisma.user.findMany({
        where: {
          OR: [
            {
              onelink: {
                contains: searchQuery,
              },
            },
            {
              wallet: {
                address: {
                  contains: searchQuery,
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          onelink: true,
          image: true,
          description: true,
          wallet: {
            select: {
              address: true,
            },
          },
        },
        take: 10, // Limit to 10 records
      });

      // Map Prisma results to the User interface expected by the client
      return users.map(user => ({
        id: user.id.toString(), // Convert Int to String
        username: user.onelink!.toLowerCase(), // Fallback to a derived username if onelink is null
        displayName: user.name,
        avatar: user.image,
        walletAddress: (user.wallet?.address as Address | undefined) ?? undefined,
      }));
    }),

  // Get user details by wallet address
  getUserByAddress: privateProcedure
    .input(z.object({ address: z.string().min(42).max(42) })) // Input is the wallet address
    .query(async ({ input }) => {
      // Find user by wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: {
          address: input.address as Address,
        },
        include: {
          user: {
            select: {
              name: true,
              onelink: true,
              image: true,
            },
          },
        },
      });

      if (!userWallet || !userWallet.user) {
        return null; // Return null as requested when not found
      }

      return {
        name: userWallet.user.name,
        onelink: userWallet.user.onelink,
        image: userWallet.user.image,
      };
    }),
});

// viem's publicKeyToAddress assumes the public key is uncompressed, but Web3Auth provides a compressed key.
// This function converts a compressed secp256k1 public key to an Ethereum address.
function web3AuthPublicKeyToAddress(publicKey: string) {
  // 1. Remove '0x' prefix if present
  const publicKeyHex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;

  // 2. Convert hex string to Uint8Array
  const publicKeyBytes = Uint8Array.from(
    publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  // 3. Hash the public key bytes with keccak256
  const hash = keccak256(publicKeyBytes);

  // 4. Take the last 20 bytes (40 hex chars) as the address
  const address = `0x${hash.slice(-40)}`;
  return getAddress(address);
}
