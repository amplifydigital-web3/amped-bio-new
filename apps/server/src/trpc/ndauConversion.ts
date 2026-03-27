import { z } from "zod";
import { router, privateProcedure, adminProcedure } from "../trpc/trpc";
import { calculateRevoAmount } from "@ampedbio/constants";
import { prisma } from "../services/DB";
import { env } from "../env";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revolutionDevnet } from "@ampedbio/web3";

export const ndauConversionRouter = router({
  /**
   * Submit a new NDAU to REVO conversion request
   * Only available to authenticated users
   */
  submitConversion: privateProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
        ndauAmount: z.string().refine(
          (val) => {
            const num = parseFloat(val);
            return !isNaN(num) && num > 0;
          },
          { message: "NDAU amount must be greater than 0" }
        ),
        revoAddress: z.string().min(1, "REVO address is required"),
      })
    )
    .mutation(async ({ input }) => {
      const { ndauAddress, ndauAmount, revoAddress } = input;
      const revoAmount = calculateRevoAmount(ndauAmount);

      const conversion = await prisma.ndauConversion.create({
        data: {
          ndau_address: ndauAddress,
          ndau_amount: ndauAmount,
          revo_amount: revoAmount,
          revo_address: revoAddress,
          status: "pending",
        },
      });

      return {
        success: true,
        message: "Conversion request submitted successfully",
        conversion: {
          id: conversion.id,
          ndauAddress: conversion.ndau_address,
          ndauAmount: conversion.ndau_amount,
          revoAmount: conversion.revo_amount,
          revoAddress: conversion.revo_address,
          status: conversion.status,
          createdAt: conversion.created_at.toISOString(),
        },
      };
    }),

  /**
   * Get all conversion requests (admin only)
   */
  getAllConversions: adminProcedure.query(async () => {
    const conversions = await prisma.ndauConversion.findMany({
      orderBy: { created_at: "desc" },
    });

    return conversions.map((c: any) => ({
      id: c.id,
      ndauAddress: c.ndau_address,
      ndauAmount: c.ndau_amount,
      revoAmount: c.revo_amount,
      revoAddress: c.revo_address,
      txid: c.txid,
      status: c.status,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at?.toISOString() || null,
    }));
  }),

  /**
   * Process a conversion and send REVO tokens automatically (admin only)
   */
  processConversion: adminProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { id } = input;

      const conversion = await prisma.ndauConversion.findUnique({
        where: { id },
      });

      if (!conversion) {
        throw new Error("Conversion request not found");
      }

      if (conversion.status === "processed") {
        throw new Error("This conversion has already been processed");
      }

      // Check if private key is configured
      const privateKey = env.NDAU_CONVERSION_PRIVATE_KEY;
      const mockMode = env.NDAU_CONVERSION_MOCK_MODE === "true";

      if (!privateKey && !mockMode) {
        throw new Error("NDAU conversion wallet not configured. Please set NDAU_CONVERSION_PRIVATE_KEY environment variable.");
      }

      let txid: string | null = null;

      if (mockMode) {
        // Mock mode: generate a dummy transaction hash
        txid = "0x" + "mock" + id.toString().padStart(60, "0");
      } else {
        // Real mode: send REVO tokens
        try {
          const account = privateKeyToAccount(privateKey as `0x${string}`);
          
          const chain = revolutionDevnet;
          const publicClient = createPublicClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          const walletClient = createWalletClient({
            chain,
            transport: http(chain.rpcUrls.default.http[0]),
          });

          // Check balance before sending
          const balance = await publicClient.getBalance({ address: account.address });
          const amountWei = parseEther(conversion.revo_amount);

          if (balance < amountWei) {
            throw new Error(`Insufficient balance. Required: ${conversion.revo_amount} REVO, Available: ${formatEther(balance)} REVO`);
          }

          // Send transaction
          const hash = await walletClient.sendTransaction({
            account,
            chain: revolutionDevnet,
            to: conversion.revo_address as Address,
            value: amountWei,
          });

          // Wait for transaction confirmation
          const receipt = await publicClient.waitForTransactionReceipt({ hash });

          if (receipt.status === "success") {
            txid = hash;
          } else {
            throw new Error("Transaction failed");
          }
        } catch (error) {
          console.error("Error sending REVO tokens:", error);
          throw new Error(`Failed to send REVO: ${(error as Error).message}`);
        }
      }

      const updatedConversion = await prisma.ndauConversion.update({
        where: { id },
        data: {
          txid,
          status: "processed",
          updated_at: new Date(),
        },
      });

      return {
        success: true,
        message: "Conversion processed successfully. REVO tokens sent!",
        conversion: {
          id: updatedConversion.id,
          ndauAddress: updatedConversion.ndau_address,
          ndauAmount: updatedConversion.ndau_amount,
          revoAmount: updatedConversion.revo_amount,
          revoAddress: updatedConversion.revo_address,
          txid: updatedConversion.txid,
          status: updatedConversion.status,
        },
      };
    }),

  /**
   * Get pending conversions count (for admin dashboard)
   */
  getPendingConversionsCount: adminProcedure.query(async () => {
    const count = await prisma.ndauConversion.count({
      where: { status: "pending" },
    });
    return { count };
  }),
});
