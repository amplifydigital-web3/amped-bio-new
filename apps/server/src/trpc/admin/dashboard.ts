import { adminProcedure, router } from "../trpc";
import { prisma } from "../../services/DB";
import { env } from "../../env";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../../utils/chainConfig";

export const dashboardRouter = router({
  getDashboardStats: adminProcedure.query(async () => {
    // Today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Last week's date for filtering
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    // User statistics
    const totalUsers = await prisma.user.count();
    const newThisWeek = await prisma.user.count({
      where: {
        created_at: {
          gte: lastWeek,
        },
      },
    });

    // Count users with reward program
    const rewardProgramUsers = await prisma.user.count({
      where: {
        reward_business_id: {
          not: null,
        },
      },
    });

    // Percentage of users with a reward program
    const rewardProgramPercentage = totalUsers > 0 ? (rewardProgramUsers / totalUsers) * 100 : 0;

    // Block statistics
    const totalBlocks = await prisma.block.count();
    const blocksCreatedToday = await prisma.block.count({
      where: {
        created_at: {
          gte: today,
        },
      },
    });
    const mostPopularBlockType = await prisma.block.groupBy({
      by: ["type"],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 1,
    });

    // Calculate average blocks per user
    const averageBlocksPerUser = totalUsers > 0 ? totalBlocks / totalUsers : 0;

    // Get wallet information for faucet
    let faucetWalletInfo = null;
    try {
      // Get chain configuration from centralized utility
      const chain = getChainConfig();

      // Create account from private key
      const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);

      // Create public client for fetching blockchain data
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      // Get wallet balance
      const balance = await publicClient.getBalance({ address: account.address });

      // Format balance to human-readable format
      const formattedBalance = formatEther(balance);

      // Calculate remaining airdrops based on balance and faucet amount
      const faucetAmount = Number(env.FAUCET_AMOUNT);
      const remainingAirdrops = faucetAmount > 0 ? parseFloat(formattedBalance) / faucetAmount : 0;

      faucetWalletInfo = {
        address: account.address,
        balance: balance.toString(),
        formattedBalance,
        remainingAirdrops: Math.floor(remainingAirdrops),
        faucetAmount,
        currency: chain.nativeCurrency.symbol,
        isMockMode: env.FAUCET_MOCK_MODE === "true",
      };
    } catch (error) {
      console.error("Error getting faucet wallet info:", error);
      faucetWalletInfo = {
        error: "Failed to get faucet wallet information",
      };
    }

    return {
      userStats: {
        totalUsers,
        newThisWeek,
        rewardProgramUsers,
        rewardProgramPercentage: parseFloat(rewardProgramPercentage.toFixed(1)),
      },
      blockStats: {
        totalBlocks,
        blocksCreatedToday,
        averageBlocksPerUser: parseFloat(averageBlocksPerUser.toFixed(1)),
        mostPopularBlockType: mostPopularBlockType.length > 0 ? mostPopularBlockType[0].type : null,
      },
      faucetWalletInfo,
    };
  }),
});
