import { z } from 'zod';
import { router, privateProcedure } from './trpc';
import { WalletService } from '../services/WalletService';

export const walletRouter = router({
  // Send token (native REVO if tokenAddress is 0x0, ERC-20 otherwise)
  sendToken: privateProcedure
    .input(z.object({
      toAddress: z.string().min(1, 'Recipient address is required'),
      tokenAddress: z.string().min(1, 'Token address is required'), // Use '0x0' for native REVO
      amount: z.string().min(1, 'Amount is required'),
      gasPrice: z.string().optional(),
      gasLimit: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      
      // Get user's wallet
      const wallet = await WalletService.getUserWallet(user.id);
      
      if (!wallet) {
        throw new Error('User wallet not found');
      }

      // Validate address format
      if (!WalletService.isValidEthereumAddress(input.toAddress)) {
        throw new Error('Invalid recipient address format');
      }

      // Validate amount is positive
      const amount = parseFloat(input.amount);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      const isNativeToken = input.tokenAddress === '0x0';
      const tokenType = isNativeToken ? 'Native REVO' : 'ERC-20 Token';
      const tokenSymbol = isNativeToken ? 'REVO' : 'TOKEN';

      console.log('🚀 ZKsync Token Transfer Request:');
      console.log(`  Type: ${tokenType}`);
      console.log(`  From User ID: ${user.id}`);
      console.log(`  From Email: ${user.email}`);
      console.log(`  From Address: ${wallet.address}`);
      console.log(`  To Address: ${input.toAddress}`);
      console.log(`  Token Address: ${input.tokenAddress}`);
      console.log(`  Amount: ${input.amount} ${tokenSymbol}`);
      if (input.gasPrice) console.log(`  Gas Price: ${input.gasPrice} gwei`);
      if (input.gasLimit) console.log(`  Gas Limit: ${input.gasLimit}`);
      console.log('  Transaction Type: EIP-712 (ZKsync)');

      // Send transaction based on token type
      let result;
      if (isNativeToken) {
        // Send native REVO using ETH send method
        result = await WalletService.sendETH(
          user.id,
          input.toAddress,
          input.amount,
          input.gasPrice,
          input.gasLimit ? BigInt(input.gasLimit) : undefined
        );
      } else {
        // Send ERC-20 token
        result = await WalletService.sendToken(
          user.id,
          input.tokenAddress,
          input.toAddress,
          input.amount,
          input.gasPrice,
          input.gasLimit ? BigInt(input.gasLimit) : undefined
        );
      }

      return {
        ...result,
        status: 'confirmed',
        message: `Successfully sent ${input.amount} ${tokenSymbol} to ${input.toAddress} via ZKsync`,
      };
    }),

  // Get user's wallet info
  getWallet: privateProcedure
    .query(async ({ ctx }) => {
      const { user } = ctx;
      
      const wallet = await WalletService.getUserWallet(user.id);
      
      if (!wallet) {
        return null;
      }

      return {
        id: wallet.id,
        address: wallet.address,
        created_at: wallet.created_at,
      };
    }),

  // Create wallet for user
  createWallet: privateProcedure
    .mutation(async ({ ctx }) => {
      const { user } = ctx;
      
      const wallet = await WalletService.createWalletForUser(user.id);
      
      return {
        id: wallet.id,
        address: wallet.address,
        created_at: wallet.created_at,
      };
    }),

  // Get user's ETH balance
  getETHBalance: privateProcedure
    .query(async ({ ctx }) => {
      const { user } = ctx;
      
      const balance = await WalletService.getUserETHBalance(user.id);
      
      return {
        balance,
        symbol: 'REVO',
        formatted: `${balance} REVO`,
      };
    }),

  // Send ETH (native REVO)
  sendETH: privateProcedure
    .input(z.object({
      toAddress: z.string().min(1, 'Recipient address is required'),
      amount: z.string().min(1, 'Amount is required'),
      gasPrice: z.string().optional(),
      gasLimit: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      
      // Validate address format
      if (!WalletService.isValidEthereumAddress(input.toAddress)) {
        throw new Error('Invalid recipient address format');
      }

      // Validate amount is positive
      const amount = parseFloat(input.amount);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      console.log('🚀 ZKsync ETH Transfer Request:');
      console.log(`  From User ID: ${user.id}`);
      console.log(`  From Email: ${user.email}`);
      console.log(`  To Address: ${input.toAddress}`);
      console.log(`  Amount: ${input.amount} REVO`);
      if (input.gasPrice) console.log(`  Gas Price: ${input.gasPrice} gwei`);
      if (input.gasLimit) console.log(`  Gas Limit: ${input.gasLimit}`);
      console.log('  Transaction Type: EIP-712 (ZKsync)');

      const result = await WalletService.sendETH(
        user.id,
        input.toAddress,
        input.amount,
        input.gasPrice,
        input.gasLimit ? BigInt(input.gasLimit) : undefined
      );

      return {
        ...result,
        status: 'confirmed',
        message: `Successfully sent ${input.amount} REVO to ${input.toAddress} via ZKsync`,
      };
    }),

  // Get user's ERC-20 token balance
  getTokenBalance: privateProcedure
    .input(z.object({
      tokenAddress: z.string().min(1, 'Token address is required'),
    }))
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      
      // Validate token address format
      if (!WalletService.isValidEthereumAddress(input.tokenAddress)) {
        throw new Error('Invalid token address format');
      }

      const balance = await WalletService.getUserTokenBalance(user.id, input.tokenAddress);
      
      return {
        balance,
        tokenAddress: input.tokenAddress,
        symbol: 'TOKEN', // In production, you'd fetch this from the contract
        formatted: `${balance} TOKEN`,
      };
    }),
});
