#!/usr/bin/env tsx

/**
 * Compliance copy check for Amped Messages (Build Board #2 r4, spec acceptance 13) and
 * for the Theme Engine v2 effect registry (Build Board #28, spec 3.2).
 *
 * Every string in packages/constants/src/messages.ts must pass BROADCAST_BANNED_TERMS
 * plus MESSAGE_BANNED_PHRASES, never put an amount next to tREVO and carry no dashes.
 * Every effect label and description passes BROADCAST_BANNED_TERMS and carries no
 * dashes. Template strings are checked with sample values. (The Telegram copy this
 * check started with went with Telegram in PR M8.)
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
  MESSAGE_BANNED_PHRASES,
  TESTNET_NOTICE,
  collectMessageCopy,
  findBannedTerms,
} from "../packages/constants/src/index";

type Hit = { text: string; phrase: string; rule: string };

/** Quotes the testnet policy rather than promoting, so it is skipped by exact match. */
const EXEMPT = new Set<string>([TESTNET_NOTICE]);

export function checkMessageCopy(strings: string[]): Hit[] {
  const hits: Hit[] = [];
  const exempt = EXEMPT;
  for (const text of strings) {
    if (exempt.has(text)) continue;
    const normalized = text.normalize("NFKC").toLowerCase();
    for (const hit of findBannedTerms(text)) {
      hits.push({ text, phrase: hit.phrase, rule: `broadcast:${hit.category}` });
    }
    for (const phrase of MESSAGE_BANNED_PHRASES) {
      if (normalized.includes(phrase)) hits.push({ text, phrase, rule: "messages:phrase" });
    }
    // An amount beside tREVO or REVO is never shown in messaging copy
    if (/\d[\d,.]*\s*t?revo\b/i.test(text) || /\bt?revo\s*\d/i.test(text)) {
      hits.push({ text, phrase: "amount next to REVO", rule: "messages:amount" });
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
  const effects = ALL_EFFECTS.flatMap(entry => [entry.label, entry.description]);
  const effectsOk = report(
    "effect",
    "packages/constants/src/effects/",
    effects,
    checkEffectCopy(effects)
  );
  const messages = collectMessageCopy();
  const messagesOk = report("Amped Messages", "packages/constants/src/messages.ts", messages, [
    ...checkMessageCopy(messages),
    ...checkEffectCopy(messages),
  ]);
  const gating = await gatingCopy();
  const gatingOk = report("content gating", "content gating copy", gating.all, gating.hits);
  if (!effectsOk || !messagesOk || !gatingOk) process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /check-compliance-copy\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) void main();
