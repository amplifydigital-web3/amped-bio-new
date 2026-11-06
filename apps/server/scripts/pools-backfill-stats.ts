/**
 * Backfill the pool list stats columns (Build Board D7, PL1).
 * Spec: docs/features/pools-list-paging.md section 3.2.
 *
 *   pnpm run --filter server pools:backfill-stats                  dry run, prints the changes
 *   pnpm run --filter server pools:backfill-stats --apply          writes them
 *   pnpm run --filter server pools:backfill-stats --chain 73863    one chain only
 *
 * Run after migration 20261029180000_pool_stats_columns. Safe to run again.
 * On staging, compare about 20 pools with their pool pages before production.
 */
import "dotenv/config";
import { prisma } from "@repo/database";
import { backfillPoolStats } from "../src/services/poolStatsBackfill";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const chainIndex = args.indexOf("--chain");
  const chainId = chainIndex >= 0 ? args[chainIndex + 1] : undefined;
  if (chainIndex >= 0 && !chainId) {
    console.error("Usage: pools:backfill-stats [--chain <id>] [--apply]");
    process.exit(1);
  }
  await backfillPoolStats({ apply, chainId });
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
