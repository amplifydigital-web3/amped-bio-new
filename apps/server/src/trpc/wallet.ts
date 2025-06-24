import { router, privateProcedure } from "./trpc";
import { z } from "zod";
import { WalletService } from "../services/WalletService";

export const walletRouter = router({
  // Get user's wallet information
  getWallet: privateProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      return await WalletService.getUserWallet(userId);
    }),

  // Create a wallet for the user (if they don't have one)
  createWallet: privateProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      return await WalletService.createWalletForUser(userId);
    }),

  // Get wallet private key (use with extreme caution!)
  getPrivateKey: privateProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      return {
        privateKey: await WalletService.getUserWalletPrivateKey(userId),
      };
    }),
});
