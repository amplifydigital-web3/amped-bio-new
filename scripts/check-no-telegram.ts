#!/usr/bin/env tsx

/**
 * Telegram is gone (Amped Messages, Build Board #2 r4, PR M8). This check keeps it gone
 * and keeps the invite pilots closed:
 *
 * 1. No MESSAGING_INVITE_ONLY or BROADCAST_INVITE_ONLY anywhere in code, env files or
 *    turbo.json. Messaging and Broadcast are open to everyone (M2).
 * 2. No `invitedAt` in application code: the column stays until the table drop, but
 *    nothing reads it as a gate. Tests may still seed it.
 * 3. No Telegram module import: services/telegram, routes/telegram, trpc/telegram, the
 *    wizard, groups and Mini App files, grammy. The social Telegram text block
 *    (blocks/TelegramBlock) is a link to a channel and stays.
 * 4. No call to the removed routers (trpc.telegram, trpc.messaging.creator or .fan) and
 *    no TELEGRAM_* environment variable read (TELEGRAM_LINK is the community link).
 * 5. No `telegram` feature flag read (isFeatureOn / useFeatureFlag / resolveLandingFlag):
 *    the registry entry was removed with Telegram.
 *
 * Run: `pnpm run check:telegram` (also a step in .github/workflows/typecheck-build.yml).
 * Exit code 1 on any hit, with the file, the line and the rule.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Rule = { id: string; test: (line: string, file: string) => boolean };

const CODE = /\.(ts|tsx|js|mjs|cjs|jsx)$/;
const ENV = /(^|\/)\.env(\.[\w-]+)?$/;

/** Paths that describe the history rather than run it. */
const SKIP = [
  /^docs\//,
  /^packages\/database\/prisma\/migrations\//,
  /^packages\/database\/src\/generated\//,
  /^packages\/database\/prisma\/schema\.prisma$/,
  /(^|\/)dist\//,
  /^scripts\/check-no-telegram\.ts$/,
  /\.md$/,
];

const isTest = (file: string) => /(__tests__|\.test\.|\.spec\.|\/e2e\/)/.test(file);

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)["']([^"']+)["']/;

export const RULES: Rule[] = [
  {
    id: "invite-only flag",
    test: line => /\b(MESSAGING_INVITE_ONLY|BROADCAST_INVITE_ONLY)\b/.test(line),
  },
  {
    id: "invitedAt gate",
    test: (line, file) => CODE.test(file) && !isTest(file) && /\binvitedAt\b/.test(line),
  },
  {
    id: "Telegram import",
    test: (line, file) => {
      if (!CODE.test(file)) return false;
      const spec = IMPORT.exec(line)?.[1];
      if (!spec) return false;
      if (/(^|\/)TelegramBlock$/.test(spec)) return false;
      return /telegram|grammy/i.test(spec);
    },
  },
  {
    id: "removed router",
    test: (line, file) =>
      CODE.test(file) &&
      /\btrpc(Client)?\.(telegram\b|messaging\.(creator|fan)\b|admin\.telegram\b)/.test(line),
  },
  {
    id: "Telegram env",
    test: (line, file) =>
      (CODE.test(file) &&
        /\b(process\.)?env\.(TELEGRAM_\w+|VITE_SHOW_TELEGRAM|NEXT_PUBLIC_SHOW_TELEGRAM)\b/.test(
          line
        )) ||
      ((ENV.test(file) || file === "turbo.json") &&
        /^\s*"?(TELEGRAM_\w+|VITE_SHOW_TELEGRAM|NEXT_PUBLIC_SHOW_TELEGRAM)"?\s*[=,\]]?/.test(line)),
  },
  {
    id: "Telegram feature flag",
    test: (line, file) =>
      CODE.test(file) &&
      /\b(isFeatureOn|useFeatureFlag|resolveLandingFlag)\(\s*["']telegram["']/.test(line),
  },
];

export function scan(files: string[], read: (file: string) => string) {
  const hits: { file: string; line: number; rule: string; text: string }[] = [];
  for (const file of files) {
    if (SKIP.some(re => re.test(file))) continue;
    if (!CODE.test(file) && !ENV.test(file) && file !== "turbo.json") continue;
    const lines = read(file).split("\n");
    lines.forEach((text, i) => {
      for (const rule of RULES) {
        if (rule.test(text, file)) hits.push({ file, line: i + 1, rule: rule.id, text });
      }
    });
  }
  return hits;
}

function main() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const hits = scan(files, file => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return "";
    }
  });
  if (hits.length === 0) {
    console.log(`check-no-telegram: ${files.length} files checked, no Telegram or invite gate.`);
    return;
  }
  console.error(`check-no-telegram: ${hits.length} hit(s)`);
  for (const hit of hits) {
    console.error(`  [${hit.rule}] ${hit.file}:${hit.line}: ${hit.text.trim()}`);
  }
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /check-no-telegram\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) main();
