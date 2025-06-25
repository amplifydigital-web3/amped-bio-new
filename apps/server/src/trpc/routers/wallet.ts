import { z } from 'zod';
import { router, privateProcedure } from '../trpc';
import { WalletService } from '../../services/WalletService';

export const walletRouter = router({
  // Send token (native REVO if tokenAddress is 0x0)
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

      const tokenType = input.tokenAddress === '0x0' ? 'Native REVO' : 'ERC-20 Token';
      const tokenSymbol = input.tokenAddress === '0x0' ? 'REVO' : 'TOKEN';

      console.log('🚀 Token Transfer Request:');
      console.log(`  Type: ${tokenType}`);
      console.log(`  From User ID: ${user.id}`);
      console.log(`  From Email: ${user.email}`);
      console.log(`  From Address: ${wallet.address}`);
      console.log(`  To Address: ${input.toAddress}`);
      console.log(`  Token Address: ${input.tokenAddress}`);
      console.log(`  Amount: ${input.amount} ${tokenSymbol}`);
      if (input.gasPrice) console.log(`  Gas Price: ${input.gasPrice} gwei`);
      if (input.gasLimit) console.log(`  Gas Limit: ${input.gasLimit}`);
      console.log('  Status: Simulated (no real transfer)');

      // Return mock response
      return {
        transactionHash: `0x${Math.random().toString(16).substring(2, 66)}`,
        from: wallet.address,
        to: input.toAddress,
        tokenAddress: input.tokenAddress,
        amount: input.amount,
        transactionType: input.tokenAddress === '0x0' ? 'native' : 'erc20',
        status: 'simulated',
        message: `Mock transfer of ${input.amount} ${tokenSymbol} from ${wallet.address} to ${input.toAddress}`,
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

  // Test token transfer (simulated)
  testSendToken: privateProcedure
    .input(z.object({
      toAddress: z.string().min(1, 'Recipient address is required'),
      tokenAddress: z.string().min(1, 'Token address is required'),
      amount: z.string().min(1, 'Amount is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      
      console.log('🧪 Test Token Transfer Request:');
      console.log(`  User ID: ${user.id}`);
      console.log(`  User Email: ${user.email}`);
      console.log(`  To Address: ${input.toAddress}`);
      console.log(`  Token Address: ${input.tokenAddress}`);
      console.log(`  Amount: ${input.amount}`);
      
      if (input.tokenAddress === '0x0') {
        console.log('  Token Type: Native REVO');
      } else {
        console.log('  Token Type: ERC-20 Token');
      }
      
      return {
        success: true,
        message: `Test transfer of ${input.amount} ${input.tokenAddress === '0x0' ? 'REVO' : 'tokens'} to ${input.toAddress}`,
        transactionType: input.tokenAddress === '0x0' ? 'native' : 'erc20',
        simulation: true,
      };
    }),
});
