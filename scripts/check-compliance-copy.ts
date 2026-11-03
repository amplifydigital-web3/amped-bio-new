#!/usr/bin/env tsx

/**
 * Compliance copy check for Messaging on Telegram (Build Board #2), spec acceptance 18,
 * and for the Theme Engine v2 effect registry (Build Board #28, spec 3.2): every effect
 * label and description passes BROADCAST_BANNED_TERMS and carries no dashes.
 *
 * Every string in packages/constants/src/telegram.ts (product copy, wizard copy, bot
 * messages, BotFather profile fields) must pass BROADCAST_BANNED_TERMS plus the Telegram
 * phrase list, and must never put an amount next to tREVO. Template strings are checked
 * with sample values.
 *
 * Content gating (PR C8, content gating 4.3): every gating string passes
 * CONTENT_BANNED_TERMS and carries no dashes; every stake gate string also
 * passes ACCESS_BANNED_TERMS (never "member" or "buy" on a stake gate), and the
 * retired labels "Pool members" and "Members with a minimum stake" never come
 * back. Every component that shows a pool or tREVO on a gate renders
 * TESTNET_NOTICE and ACCESS_STAKE_DISCLOSURE from the constants.
 *
 * Run: `pnpm run check:copy` (also a step in .github/workflows/typecheck-build.yml).
 * Exit code 1 on any hit, with the string and the phrase that matched.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCESS_BANNED_TERMS,
  ACCESS_RULE_SUMMARIES,
  CONTENT_BANNED_TERMS,
  findComplianceTerms,
  ALL_EFFECTS,
  TELEGRAM_BANNED_PHRASES,
  TELEGRAM_COPY_EXEMPT,
  collectMessageCopy,
  collectTelegramCopy,
  findBannedTerms,
  REFUND_SUMMARY,
  STORE_COPY,
} from "../packages/constants/src/index";

type Hit = { text: string; phrase: string; rule: string };

export function checkTelegramCopy(strings: string[]): Hit[] {
  const hits: Hit[] = [];
  const exempt = new Set<string>(TELEGRAM_COPY_EXEMPT);
  for (const text of strings) {
    if (exempt.has(text)) continue;
    const normalized = text.normalize("NFKC").toLowerCase();
    for (const hit of findBannedTerms(text)) {
      hits.push({ text, phrase: hit.phrase, rule: `broadcast:${hit.category}` });
    }
    for (const phrase of TELEGRAM_BANNED_PHRASES) {
      if (normalized.includes(phrase)) hits.push({ text, phrase, rule: "telegram:phrase" });
    }
    // An amount beside tREVO or REVO is never shown on a Telegram surface
    if (/\d[\d,.]*\s*t?revo\b/i.test(text) || /\bt?revo\s*\d/i.test(text)) {
      hits.push({ text, phrase: "amount next to REVO", rule: "telegram:amount" });
    }
  }
  return hits;
}

/** En dash and em dash, built from char codes so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

/** Effect names say what the eye sees (decision 10): no banned words, no dashes. */
export function checkEffectCopy(strings: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const text of strings) {
    for (const hit of findBannedTerms(text)) {
      hits.push({ text, phrase: hit.phrase, rule: `broadcast:${hit.category}` });
    }
    if (DASHES.test(text)) hits.push({ text, phrase: "dash", rule: "effects:dash" });
  }
  return hits;
}

/** Labels retired by content gating revision 4: Members means the USDC kind only. */
export const RETIRED_GATE_LABELS = ["pool members", "members with a minimum stake"];

/** Gating copy: content terms and no dashes everywhere, access terms on stake gates. */
export function checkGatingCopy(all: string[], stakeGate: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const text of all) {
    for (const phrase of findComplianceTerms(text, CONTENT_BANNED_TERMS)) {
      hits.push({ text, phrase, rule: "gating:content" });
    }
    if (DASHES.test(text)) hits.push({ text, phrase: "dash", rule: "gating:dash" });
    for (const phrase of RETIRED_GATE_LABELS) {
      if (text.toLowerCase().includes(phrase)) hits.push({ text, phrase, rule: "gating:retired" });
    }
  }
  for (const text of stakeGate) {
    for (const phrase of findComplianceTerms(text, ACCESS_BANNED_TERMS)) {
      hits.push({ text, phrase, rule: "gating:stake" });
    }
  }
  return hits;
}

/**
 * Store surfaces (C9, store-catalog.md acceptance 5): the content rules, no dashes, no stake words,
 * and never "Yours to keep", "a month", "monthly" or the word price.
 */
const STORE_RETIRED = [
  "yours to keep",
  "a month",
  "monthly",
  "price",
  "stake",
  "staking",
  "pool",
  "trevo",
];

export function checkStoreCopy(all: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const text of all) {
    for (const phrase of findComplianceTerms(text, CONTENT_BANNED_TERMS)) {
      hits.push({ text, phrase, rule: "store:content" });
    }
    if (DASHES.test(text)) hits.push({ text, phrase: "dash", rule: "store:dash" });
    const lower = text.toLowerCase();
    for (const phrase of STORE_RETIRED) {
      if (new RegExp(`\\b${phrase}\\b`).test(lower))
        hits.push({ text, phrase, rule: "store:retired" });
    }
  }
  return hits;
}

/** Components that show a pool or tREVO on a gate must render both notices. */
export const STAKE_GATE_SOURCES = [
  "apps/client/src/components/panels/content/AccessPicker.tsx",
  "apps/landingpage/src/components/content/gating.tsx",
];

export function checkStakeGateSources(root: string, files = STAKE_GATE_SOURCES): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const name of ["TESTNET_NOTICE", "ACCESS_STAKE_DISCLOSURE"]) {
      if (!new RegExp(`\\{${name}\\}`).test(source)) {
        hits.push({ text: file, phrase: name, rule: "gating:notice" });
      }
    }
  }
  return hits;
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    out.push(String((value as (...args: unknown[]) => unknown)("maya")));
  } else if (value && typeof value === "object") Object.values(value).forEach(v => strings(v, out));
  return out;
}

async function gatingCopy() {
  const root = join(__dirname, "..");
  const client = (await import("../apps/client/src/components/panels/content/copy")).CONTENT_COPY
    .editor.gate;
  const site = (await import("../apps/landingpage/src/components/content/copy")).SITE_CONTENT_COPY
    .gate;
  const summaries = Object.values(ACCESS_RULE_SUMMARIES);
  const stakeGate = [
    ACCESS_RULE_SUMMARIES.pool_member,
    ACCESS_RULE_SUMMARIES.stake_min,
    client.poolHelp,
    client.stakeHelp,
    client.notAllowed,
    client.noPool,
    client.amountLabel,
    client.amountUnit,
    client.amountHelp,
    client.amountInvalid,
    site.poolTitle,
    site.stakeBelowTitle,
    site.poolBody,
    site.goToPool,
    site.walletTitle,
    site.walletBody,
  ];
  const all = [...summaries, ...strings(client), ...strings(site)];
  return {
    all,
    stakeGate,
    hits: [...checkGatingCopy(all, stakeGate), ...checkStakeGateSources(root)],
  };
}

function report(label: string, file: string, strings: string[], hits: Hit[]): boolean {
  if (hits.length === 0) {
    console.log(`check-compliance-copy: ${strings.length} ${label} strings pass.`);
    return true;
  }
  console.error(`check-compliance-copy: ${hits.length} hit(s) in ${file}`);
  for (const hit of hits) {
    console.error(`  [${hit.rule}] "${hit.phrase}" in: ${hit.text}`);
  }
  return false;
}

async function main() {
  const telegram = collectTelegramCopy();
  const effects = ALL_EFFECTS.flatMap(entry => [entry.label, entry.description]);
  const telegramOk = report(
    "Telegram",
    "packages/constants/src/telegram.ts",
    telegram,
    checkTelegramCopy(telegram)
  );
  const effectsOk = report(
    "effect",
    "packages/constants/src/effects/",
    effects,
    checkEffectCopy(effects)
  );
  // Amped Messages (PR M2): the Telegram rules plus no dashes
  const messages = collectMessageCopy();
  const messagesOk = report("Amped Messages", "packages/constants/src/messages.ts", messages, [
    ...checkTelegramCopy(messages),
    ...checkEffectCopy(messages),
  ]);
  const gating = await gatingCopy();
  const gatingOk = report("content gating", "content gating copy", gating.all, gating.hits);
  const store = [...strings(STORE_COPY), ...Object.values(REFUND_SUMMARY)];
  const storeOk = report("store", "packages/constants/src/store.ts", store, checkStoreCopy(store));
  if (!telegramOk || !effectsOk || !messagesOk || !gatingOk || !storeOk) process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /check-compliance-copy\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) void main();
