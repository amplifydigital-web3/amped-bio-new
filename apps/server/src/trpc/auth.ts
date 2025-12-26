import { router, privateProcedure } from "./trpc";
import { TRPCError } from "@trpc/server";
import { generateAccessToken } from "../utils/token";
import { getFileUrl } from "../utils/fileUrlResolver";
import { prisma } from "../services/DB";

// Helper function to handle Prisma errors
function handlePrismaError(error: unknown, operation: string) {
  console.error(`Prisma error in ${operation}:`, error);

  // Log the full error details for debugging
  if (error instanceof Error) {
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
  }

  // Return generic internal server error to frontend
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error occurred",
  });
}

// Token generation and cookie setting are now handled by Better Auth

export const authRouter = router({
  me: privateProcedure.query(async ({ ctx }) => {
    try {
      const userId = ctx.user.sub;

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid credentials",
        });
      }

      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: user.id },
        select: { address: true },
      });

      // Resolve user image URL
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          onelink: user.onelink,
          role: user.role,
          image: imageUrl,
          wallet: userWallet?.address || null,
          hasPool: false,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "me");
    }
  }),

  getWalletToken: privateProcedure.query(async ({ ctx }) => {
    try {
      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: ctx.user.sub },
        select: { address: true },
      });

      return {
        walletToken: generateAccessToken({
          id: ctx.user.sub,
          email: ctx.user.email,
          role: ctx.user.role,
          wallet: userWallet?.address ?? null,
        }),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "getWalletToken");
    }
  }),
});
