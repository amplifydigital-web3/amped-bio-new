import { schedule, ScheduledTask } from "node-cron";
import { prisma } from "@repo/database";
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
      // The admin panel writes these to site settings, so the cron reads them
      // there first and falls back to the env defaults
      const rows = await prisma.siteSettings.findMany({
        where: {
          setting_key: {
            in: ["daily_airdrop_batch_hour", "daily_airdrop_min_entries", "daily_airdrop_max_wait_hours"],
          },
        },
      });
      const setting = (key: string, fallback: number): number => {
        const value = Number(rows.find(row => row.setting_key === key)?.setting_value);
        return Number.isFinite(value) ? value : fallback;
      };
      const batchHourUTC = setting("daily_airdrop_batch_hour", env.DAILY_AIRDROP_BATCH_HOUR ?? 14);
      const minEntries = setting("daily_airdrop_min_entries", env.DAILY_AIRDROP_MIN_ENTRIES ?? 5);
      const maxWaitHours = setting("daily_airdrop_max_wait_hours", env.DAILY_AIRDROP_MAX_WAIT_HOURS ?? 6);

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