import { z } from "zod";
import { router, privateProcedure } from "./trpc";
import { WalletService } from "../services/WalletService";
import { TokenTransferService } from "../services/TokenTransferService";
import { TRPCError } from "@trpc/server";

// Validation schemas
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");
const tokenAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$|^0x0$/, "Invalid token address");
const amountSchema = z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format");

const sendTokenSchema = z.object({
  to: addressSchema,
  tokenAddress: tokenAddressSchema,
  amount: amountSchema,
  gasPrice: z.string().optional(),
  gasLimit: z.string().optional(),
});

const getTokenBalanceSchema = z.object({
  tokenAddress: tokenAddressSchema,
  userAddress: addressSchema.optional(),
});

const getTransactionStatusSchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
});

const estimateGasSchema = z.object({
  to: addressSchema,
  tokenAddress: tokenAddressSchema,
  amount: amountSchema,
});

export const walletRouter = router({
  // Get user's wallet information
  getWallet: privateProcedure.query(async ({ ctx }) => {
    try {
      return await WalletService.getUserWallet(ctx.user.id);
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get wallet information",
      });
    }
  }),

  // Create a new wallet for the user
  createWallet: privateProcedure.mutation(async ({ ctx }) => {
    try {
      return await WalletService.createWalletForUser(ctx.user.id);
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create wallet",
      });
    }
  }),

  // Send tokens (including native REVO when tokenAddress is 0x0)
  sendToken: privateProcedure
    .input(sendTokenSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { to, tokenAddress, amount, gasPrice, gasLimit } = input;
        
        // Get user's wallet
        const wallet = await WalletService.getUserWallet(ctx.user.id);
        
        // Send the token transaction
        const result = await TokenTransferService.sendToken({
          fromUserId: ctx.user.id,
          fromAddress: wallet.address,
          toAddress: to,
          tokenAddress,
          amount,
          gasPrice,
          gasLimit,
        });

        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error sending token:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send token",
        });
      }
    }),

  // Get token balance (including native REVO when tokenAddress is 0x0)
  getTokenBalance: privateProcedure
    .input(getTokenBalanceSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { tokenAddress, userAddress } = input;
        
        // Use provided address or get user's wallet address
        let address = userAddress;
        if (!address) {
          const wallet = await WalletService.getUserWallet(ctx.user.id);
          address = wallet.address;
        }

        const balance = await TokenTransferService.getTokenBalance({
          address,
          tokenAddress,
        });

        return {
          address,
          tokenAddress,
          balance,
          isNativeToken: tokenAddress === "0x0",
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error getting token balance:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get token balance",
        });
      }
    }),

  // Get multiple token balances at once
  getMultipleTokenBalances: privateProcedure
    .input(z.object({
      tokenAddresses: z.array(tokenAddressSchema),
      userAddress: addressSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { tokenAddresses, userAddress } = input;
        
        // Use provided address or get user's wallet address
        let address = userAddress;
        if (!address) {
          const wallet = await WalletService.getUserWallet(ctx.user.id);
          address = wallet.address;
        }

        const balances = await Promise.all(
          tokenAddresses.map(async (tokenAddress) => {
            try {
              const balance = await TokenTransferService.getTokenBalance({
                address,
                tokenAddress,
              });
              return {
                tokenAddress,
                balance,
                isNativeToken: tokenAddress === "0x0",
                error: null,
              };
            } catch (error) {
              return {
                tokenAddress,
                balance: "0",
                isNativeToken: tokenAddress === "0x0",
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }
          })
        );

        return {
          address,
          balances,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error getting multiple token balances:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get token balances",
        });
      }
    }),

  // Estimate gas for a token transfer
  estimateGas: privateProcedure
    .input(estimateGasSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { to, tokenAddress, amount } = input;
        
        // Get user's wallet
        const wallet = await WalletService.getUserWallet(ctx.user.id);
        
        const gasEstimate = await TokenTransferService.estimateGas({
          fromAddress: wallet.address,
          toAddress: to,
          tokenAddress,
          amount,
        });

        return gasEstimate;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error estimating gas:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to estimate gas",
        });
      }
    }),

  // Get transaction status
  getTransactionStatus: privateProcedure
    .input(getTransactionStatusSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { transactionHash } = input;
        
        const status = await TokenTransferService.getTransactionStatus(transactionHash);
        
        return status;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error getting transaction status:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get transaction status",
        });
      }
    }),

  // Get user's transaction history
  getTransactionHistory: privateProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      tokenAddress: tokenAddressSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { page, limit, tokenAddress } = input;
        
        // Get user's wallet
        const wallet = await WalletService.getUserWallet(ctx.user.id);
        
        const history = await TokenTransferService.getTransactionHistory({
          address: wallet.address,
          page,
          limit,
          tokenAddress,
        });

        return history;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Error getting transaction history:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get transaction history",
        });
      }
    }),

  // Get current gas prices
  getGasPrices: privateProcedure.query(async () => {
    try {
      const gasPrices = await TokenTransferService.getGasPrices();
      return gasPrices;
    } catch (error) {
      console.error("Error getting gas prices:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get gas prices",
      });
    }
  }),

  // Validate an Ethereum address
  validateAddress: privateProcedure
    .input(z.object({
      address: z.string(),
    }))
    .query(async ({ input }) => {
      const { address } = input;
      return {
        address,
        isValid: WalletService.isValidEthereumAddress(address),
      };
    }),
});
