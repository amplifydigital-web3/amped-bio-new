import { schedule, ScheduledTask } from "node-cron";
import { prisma } from "./DB";
import { sendPendingBatch } from "./dailyAirdrop";
import { env } from "../env";

let cronJob: ScheduledTask | null = null;

export function startCronJobs(): void {
  if (cronJob) {
    console.log("[CRON] Already started");
    return;
  }

  console.log("[CRON] Starting daily airdrop batch processor...");

  // Run every 15 minutes
  cronJob = schedule("*/15 * * * *", async () => {
    try {
      const entryCount = await prisma.airdropQueueEntry.count();
      if (entryCount === 0) return;

      const firstEntry = await prisma.airdropQueueEntry.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (!firstEntry) return;

      const now = new Date();
      const batchHourUTC = env.DAILY_AIRDROP_BATCH_HOUR || 14;
      const minEntries = env.DAILY_AIRDROP_MIN_ENTRIES || 5;
      const maxWaitHours = env.DAILY_AIRDROP_MAX_WAIT_HOURS || 6;

      const isPastBatchHour = now.getUTCHours() >= batchHourUTC;
      const hasMinEntries = entryCount >= minEntries;
      const isOld =
        now.getTime() - firstEntry.createdAt.getTime() > maxWaitHours * 3_600_000;

      if (isPastBatchHour || hasMinEntries || isOld) {
        console.log(
          `[CRON_BATCH_TRIGGER] entries=${entryCount}, isPastBatchHour=${isPastBatchHour}, hasMinEntries=${hasMinEntries}, isOld=${isOld}`
        );
        await sendPendingBatch();
      }
    } catch (error) {
      console.error(
        `[CRON_ERROR] ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

  console.log("[CRON] Daily airdrop batch processor started (every 15 min)");
}

export function stopCronJobs(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[CRON] Stopped");
  }
}