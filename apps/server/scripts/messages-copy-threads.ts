/**
 * Copy the Telegram era threads into the Amped Messages tables (Build Board #2 r4, PR M1).
 * Spec: docs/features/messaging.md section 6, migration steps 2 and 3.
 *
 *   pnpm run --filter server messages:copy-threads            dry run, prints the counts
 *   pnpm run --filter server messages:copy-threads --apply    writes them
 *
 * Run after migration 20261103000000_native_messaging, on staging only. Production has
 * no message_threads rows (TELEGRAM_ENABLED=false). Safe to run again: legacy ids are
 * reused, so a second run copies nothing new. Set MESSAGES_SECRET_BOX_KEY before the
 * first run; bodies are encrypted with it.
 */
import "dotenv/config";
import { prisma } from "@repo/database";
import { copyThreadsToConversations } from "../src/services/messaging/conversations";

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const result = await copyThreadsToConversations({
    dryRun: !apply,
    log: line => console.log(line),
  });
  console.log(apply ? "Applied:" : "Dry run (add --apply to write):", JSON.stringify(result));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
