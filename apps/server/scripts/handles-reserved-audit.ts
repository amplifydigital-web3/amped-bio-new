/**
 * Reserved handles launch audit (Build Board D2, docs/features/reserved-handles.md section 5).
 *
 *   pnpm run --filter server handles:reserved-audit           print every collision, change nothing
 *   pnpm run --filter server handles:reserved-audit --apply   record the default action for each
 *
 * Lists every account whose handle matches a system word, the `_` prefix or an
 * admin tier row, by the same folded forms as the matcher, and every handle
 * longer than 64 characters. Run it on staging after the RH2 migration. RH2
 * does not reach production until every seed collision has a recorded action.
 *
 * --apply records the default action (decision A2): system, company and trust
 * words start the notice (an unpublished page is renamed at once); brand,
 * partner and hold words are kept and exempted. Audit rows have actorId null.
 */
import "dotenv/config";
import {
  HANDLE_MAX_LENGTH,
  SYSTEM_RESERVED_HANDLES,
  type ReservedHandleCategory,
  type ReservedHandleKind,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { collidingUserIds, describeAccounts } from "../src/services/handles/collisions";
import {
  sendNoticeEmails,
  startNotice,
  type PendingNoticeEmail,
} from "../src/services/handles/notices";
import { defaultHolderAction } from "../src/services/handles/admin";
import { writeAudit } from "../src/services/adminAudit";
import { uuidv7 } from "../src/utils/uuid-v7";

type Target = {
  word: string;
  kind: ReservedHandleKind;
  tier: "SYSTEM" | "ADMIN";
  category: ReservedHandleCategory | null;
  assignedUserId: number | null;
};

async function underscoreHolders(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM users WHERE littlelink_name LIKE '\\_%' ORDER BY id`;
  return rows.map(row => Number(row.id));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const adminRows = await prisma.reservedHandle.findMany({ orderBy: { word: "asc" } });
  const targets: Target[] = [
    ...[...SYSTEM_RESERVED_HANDLES].sort().map(word => ({
      word,
      kind: "EXACT" as const,
      tier: "SYSTEM" as const,
      category: null,
      assignedUserId: null,
    })),
    { word: "_", kind: "PREFIX", tier: "SYSTEM", category: null, assignedUserId: null },
    ...adminRows.map(row => ({
      word: row.word,
      kind: row.kind,
      tier: "ADMIN" as const,
      category: row.category,
      assignedUserId: row.assignedUserId,
    })),
  ];

  let collisions = 0;
  const emails: PendingNoticeEmail[] = [];
  for (const target of targets) {
    const ids = (
      target.word === "_"
        ? await underscoreHolders()
        : await collidingUserIds(prisma, target.word, target.kind)
    ).filter(id => id !== target.assignedUserId);
    if (ids.length === 0) continue;

    const accounts = await describeAccounts(prisma, ids);
    const recorded = await prisma.handleNotice.findMany({
      where: { reservedWord: target.word, userId: { in: ids } },
      select: { userId: true, state: true },
    });
    const stateOf = new Map(recorded.map(row => [row.userId, row.state]));
    const label = target.tier === "SYSTEM" ? "system" : target.category!.toLowerCase();
    console.log(
      `\n${target.word} (${label}, ${target.kind.toLowerCase()}): ${ids.length} account(s)`
    );
    for (const account of accounts) {
      collisions += 1;
      const state = stateOf.get(account.id) ?? "no action";
      console.log(
        `  @${account.handle}  id ${account.id}  ${account.pageStatus.toLowerCase()}  ` +
          `${account.followers} followers  pool ${account.hasPool ? "yes" : "no"}  ` +
          `last sign in ${account.lastSignInAt?.toISOString() ?? "never"}  [${state}]`
      );
      if (!apply || stateOf.has(account.id)) continue;

      const action = target.tier === "SYSTEM" ? "notice" : defaultHolderAction(target.category!);
      await prisma.$transaction(async tx => {
        if (action === "notice") {
          const email = await startNotice(tx, {
            userId: account.id,
            word: target.word,
            tier: target.tier,
            actorId: null,
            reason: "Launch audit",
          });
          if (email) emails.push(email);
        } else {
          await tx.handleNotice.create({
            data: {
              id: uuidv7(),
              userId: account.id,
              reservedWord: target.word,
              tier: "ADMIN",
              state: "EXEMPT",
              oldHandle: account.handle.toLowerCase(),
            },
          });
          await writeAudit(tx, {
            actorId: null,
            action: "handle.exempt",
            targetUserId: account.id,
            subject: target.word,
            reason: "Launch audit",
            after: { handle: account.handle },
          });
        }
      });
      console.log(`    recorded: ${action === "notice" ? "start notice" : "keep and exempt"}`);
    }
  }

  const long = await prisma.$queryRaw<{ id: number; handle: string }[]>`
    SELECT id, littlelink_name AS handle FROM users
    WHERE CHAR_LENGTH(littlelink_name) > ${HANDLE_MAX_LENGTH} ORDER BY id`;
  if (long.length > 0) {
    console.log(`\nHandles longer than ${HANDLE_MAX_LENGTH} characters: ${long.length}`);
    for (const row of long) console.log(`  @${row.handle}  id ${row.id}`);
  }

  if (emails.length > 0) await sendNoticeEmails(emails);
  console.log(
    `\n${collisions} collision(s). ${apply ? "Default actions recorded." : "Nothing changed (run with --apply to record the default actions)."}`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
