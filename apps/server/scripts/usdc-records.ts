/**
 * USDC records for a privacy request (Build Board #5 USDC-6, spec 3.9).
 *
 *   pnpm run --filter server usdc:records <email or handle>                 print the export as JSON
 *   pnpm run --filter server usdc:records <email or handle> --forget-token  also delete the stored Coinbase token
 *
 * Run it for an access or export request to privacy@amped.bio, and with
 * --forget-token when an account closes. Transaction records stay for 5 years
 * after the account closes (Privacy Policy section 10).
 */
import "dotenv/config";
import { prisma } from "@repo/database";
import { forgetCoinbaseToken, usdcRecordsFor } from "../src/services/usdc/records";

async function main() {
  const [who, flag] = process.argv.slice(2);
  if (!who) {
    console.error("Usage: usdc:records <email or handle> [--forget-token]");
    process.exit(1);
  }
  const user = await prisma.user.findFirst({
    where: who.includes("@") ? { email: who.toLowerCase() } : { handle: who.replace(/^@/, "") },
    select: { id: true },
  });
  if (!user) {
    console.error("No account with that email or handle.");
    process.exit(1);
  }
  const records = await usdcRecordsFor(user.id);
  console.log(JSON.stringify(records, null, 2));
  if (flag === "--forget-token") {
    const result = await forgetCoinbaseToken(user.id);
    console.error(`Coinbase token deleted: ${result.deleted}`);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
