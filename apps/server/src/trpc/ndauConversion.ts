import { z } from "zod";
import { router, publicProcedure, privateProcedure, adminProcedure } from "../trpc/trpc";
import { calculateRevoAmount } from "@ampedbio/constants";
import { prisma } from "../services/DB";
import { env } from "../env";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revolutionDevnet } from "@ampedbio/web3";
import { verifyConversionSignature } from "../utils/ndau";

export const ndauConversionRouter = router({
  checkExistingConversion: privateProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
      })
    )
    .query(async ({ input }) => {
      const existing = await prisma.ndauConversion.findFirst({
        where: { ndau_address: input.ndauAddress },
        select: { id: true, status: true },
      });

      return {
        exists: !!existing,
        status: existing?.status ?? null,
      };
    }),

  getNdauBalance: publicProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
      })
    )
    .query(async ({ input }) => {
      const { ndauAddress } = input;

      console.log(`[NDAU-BALANCE] Fetching balance of ndau address: ${ndauAddress}`);

      try {
        // Try mainnet node
        const ndauApiUrl = "http://mainnet-0.ndau.tech:3030";
        console.log(`[NDAU-BALANCE] Using API URL: ${ndauApiUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const url = `${ndauApiUrl}/account/account/${ndauAddress}`;
          console.log(`[NDAU-BALANCE] Making request to: ${url}`);

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            console.error(
              `[NDAU-BALANCE] HTTP error! status: ${response.status} for address: ${ndauAddress}`
            );
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          console.log(
            `[NDAU-BALANCE] Response received for ${ndauAddress}:`,
            JSON.stringify(data).substring(0, 200) + "..."
          );

          if (data && data[ndauAddress] && data[ndauAddress].Balance !== undefined) {
            // NDAU balance is in nanondau (1 NDAU = 1,000,000,000 nanondau)
            const balanceInNanondau = parseFloat(data[ndauAddress].Balance);
            const balanceInNdau = balanceInNanondau / 1000000000;

            console.log(
              `[NDAU-BALANCE] Balance for ${ndauAddress}: ${balanceInNdau} NDAU (${balanceInNanondau} nanondau)`
            );

            return {
              success: true,
              balance: balanceInNdau.toString(),
              rawBalance: data[ndauAddress].Balance,
              validationKeys: data[ndauAddress].ValidationKeys || [],
            };
          } else {
            console.error(
              `[NDAU-BALANCE] Invalid response from NDAU API for address: ${ndauAddress}`
            );
            throw new Error("Invalid response from NDAU API");
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error(`[NDAU-BALANCE] Fetch error for address ${ndauAddress}:`, fetchError);
          if (fetchError instanceof Error) {
            console.error(`[NDAU-BALANCE] Error details:`, {
              name: fetchError.name,
              message: fetchError.message,
              stack: fetchError.stack,
            });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error(
          `[NDAU-BALANCE] Error fetching NDAU balance for address ${ndauAddress}:`,
          error
        );

        if (error instanceof Error) {
          console.error(`[NDAU-BALANCE] Full error details:`, {
            name: error.name,
            message: error.message,
            stack: error.stack,
          });
        }

        // Return 0 balance if API fails
        return {
          success: false,
          balance: "0",
          error: error instanceof Error ? error.message : "Failed to fetch NDAU balance",
        };
      }
    }),

  submitConversion: privateProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
        revoAddress: z.string().min(1, "REVO address is required"),
        ampedbioSignature: z.string().min(1, "AmpedBio signature is required"),
        ndauSignature: z.string().min(1, "NDAU signature is required"),
        ndauValidationKey: z.string().min(1, "NDAU validation key is required"),
      })
    )
    .mutation(async ({ input }) => {
      const { ndauAddress, revoAddress, ampedbioSignature, ndauSignature, ndauValidationKey } =
        input;

      const existing = await prisma.ndauConversion.findFirst({
        where: { ndau_address: ndauAddress },
      });

      if (existing) {
        throw new Error("A conversion request already exists for this NDAU address");
      }

      let ndauAmount: string;

      try {
        const ndauApiUrl = "http://mainnet-0.ndau.tech:3030";
        const url = `${ndauApiUrl}/account/account/${ndauAddress}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data && data[ndauAddress] && data[ndauAddress].Balance !== undefined) {
          const balanceInNanondau = parseFloat(data[ndauAddress].Balance);
          const balanceInNdau = balanceInNanondau / 1000000000;

          if (balanceInNdau <= 0) {
            throw new Error("NDAU balance must be greater than 0");
          }

          ndauAmount = balanceInNdau.toString();
        } else {
          throw new Error("Invalid response from NDAU API");
        }
      } catch (error) {
        console.error(
          `[NDAU-CONVERSION] Error fetching NDAU balance for address ${ndauAddress}:`,
          error
        );
        throw new Error(
          `Failed to fetch NDAU balance: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      const revoAmount = calculateRevoAmount(ndauAmount);

      const conversion = await prisma.ndauConversion.create({
        data: {
          ndau_address: ndauAddress,
          ndau_amount: ndauAmount,
          revo_amount: revoAmount,
          revo_address: revoAddress,
          ampedbio_signature: ampedbioSignature,
          ndau_signature: ndauSignature,
          ndau_validation_key: ndauValidationKey,
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
          ampedbioSignature: conversion.ampedbio_signature,
          ndauSignature: conversion.ndau_signature,
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
      ampedbioSignature: c.ampedbio_signature,
      ndauSignature: c.ndau_signature,
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
        throw new Error(
          "NDAU conversion wallet not configured. Please set NDAU_CONVERSION_PRIVATE_KEY environment variable."
        );
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
            throw new Error(
              `Insufficient balance. Required: ${conversion.revo_amount} REVO, Available: ${formatEther(balance)} REVO`
            );
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

  getConversion: publicProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
      })
    )
    .query(async ({ input }) => {
      const conversion = await prisma.ndauConversion.findUnique({
        where: { ndau_address: input.ndauAddress },
      });

      if (!conversion) {
        return null;
      }

      return {
        id: conversion.id,
        ndauAddress: conversion.ndau_address,
        ndauAmount: conversion.ndau_amount,
        revoAmount: conversion.revo_amount,
        revoAddress: conversion.revo_address,
        ampedbioSignature: conversion.ampedbio_signature,
        ndauSignature: conversion.ndau_signature,
        txid: conversion.txid,
        status: conversion.status,
        createdAt: conversion.created_at.toISOString(),
        updatedAt: conversion.updated_at?.toISOString() || null,
      };
    }),

  verifyNdauSignature: publicProcedure
    .input(
      z.object({
        ndauAddress: z.string().min(1, "NDAU address is required"),
      })
    )
    .query(async ({ input }) => {
      const conversion = await prisma.ndauConversion.findUnique({
        where: { ndau_address: input.ndauAddress },
      });

      if (!conversion) {
        return {
          found: false,
          isValid: false,
          error: "No conversion found for this NDAU address",
        };
      }

      const result = await verifyConversionSignature(
        conversion.ndau_signature,
        conversion.ndau_address,
        conversion.revo_address,
        conversion.ndau_validation_key
      );

      return {
        found: true,
        isValid: result.isValid,
        algorithm: result.algorithm,
        error: result.error,
        conversion: {
          ndauAddress: conversion.ndau_address,
          revoAddress: conversion.revo_address,
          ndauAmount: conversion.ndau_amount,
          revoAmount: conversion.revo_amount,
          status: conversion.status,
          createdAt: conversion.created_at.toISOString(),
        },
      };
    }),
});
