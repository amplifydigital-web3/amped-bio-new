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
import { z } from "zod";
import { forgetCoinbaseToken, usdcRecordsFor } from "../src/services/usdc/records";

const argsSchema = z
  .array(z.string())
  .refine(args => args.length === 1 || (args.length === 2 && args[1] === "--forget-token"), {
    message: "Usage: usdc:records <email or handle> [--forget-token]",
  });

async function main() {
  const parsed = argsSchema.safeParse(process.argv.slice(2));
  if (!parsed.success) {
    console.error(parsed.error.issues[0]?.message ?? "Invalid arguments.");
    process.exit(1);
  }
  const [who, flag] = parsed.data;
  // A leading @ always means a handle, so @fan is not read as an email
  const handle = who.replace(/^@/, "");
  const user = await prisma.user.findFirst({
    where: who.startsWith("@") || !who.includes("@") ? { handle } : { email: who.toLowerCase() },
    select: { id: true },
  });
  if (!user) {
    console.error("No account with that email or handle.");
    process.exit(1);
  }
  // Delete before the export so the printed JSON shows the completed deletion
  if (flag === "--forget-token") {
    const result = await forgetCoinbaseToken(user.id);
    console.error(`Coinbase token deleted: ${result.deleted}`);
  }
  const records = await usdcRecordsFor(user.id);
  console.log(JSON.stringify(records, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
