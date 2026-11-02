/**
 * Unsafe block URLs (Build Board D57).
 *
 *   pnpm run --filter server blocks:unsafe-urls            count and list, change nothing
 *   pnpm run --filter server blocks:unsafe-urls --apply    neutralize every row it lists
 *
 * Finds link and media blocks whose URL is not a safe link (http, https, mailto
 * or tel for links; http or https for embeds) and legacy Telegram text blocks
 * whose channel link is not https. Neutralizing empties that URL and hides the
 * block. The block then shows in the editor as needing a link, renders nowhere,
 * and the page still saves, because the schemas accept an empty URL.
 *
 * Public reads already drop these URLs (sanitizeBlockConfig), so pages are safe
 * before this runs. Run it once on staging, then production, and keep the
 * printed list with the release notes: it is the record of what changed.
 */
import "dotenv/config";
import { prisma } from "@repo/database";
import { normalizeHref } from "@repo/constants";
import { type BlockRow, neutralizedConfig, unsafeBlockField } from "../src/utils/unsafeBlockUrls";

type Finding = { row: BlockRow; field: "url" | "content"; value: string };

const PAGE = 500;

/** First characters only, scheme visible, so the log never replays a payload in full. */
function preview(value: string) {
  const flat = normalizeHref(value);
  return flat.length > 40 ? `${flat.slice(0, 40)}...` : flat;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const found: Finding[] = [];
  let cursor = 0;
  for (;;) {
    const rows = (await prisma.block.findMany({
      where: { id: { gt: cursor }, type: { in: ["link", "media", "text"] } },
      select: { id: true, user_id: true, type: true, config: true },
      orderBy: { id: "asc" },
      take: PAGE,
    })) as BlockRow[];
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      const hit = unsafeBlockField(row);
      if (hit) found.push({ row, ...hit });
    }
  }

  for (const { row, field, value } of found) {
    console.log(`block ${row.id}  user ${row.user_id}  ${row.type}.${field}  ${preview(value)}`);
  }
  console.log(`${found.length} unsafe block${found.length === 1 ? "" : "s"} found.`);
  if (!apply || found.length === 0) {
    if (found.length > 0) console.log("Run again with --apply to neutralize them.");
    return;
  }

  let changed = 0;
  for (const { row, field } of found) {
    await prisma.block.update({
      where: { id: row.id },
      data: { config: neutralizedConfig(row.config, field) as any },
    });
    changed++;
  }
  console.log(
    `${changed} block${changed === 1 ? "" : "s"} neutralized: link emptied and block hidden.`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
