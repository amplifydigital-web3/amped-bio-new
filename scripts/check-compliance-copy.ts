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
 * Run: `pnpm run check:copy` (also a step in .github/workflows/typecheck-build.yml).
 * Exit code 1 on any hit, with the string and the phrase that matched.
 */

import {
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

function main() {
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
  if (!effectsOk || !messagesOk) process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /check-compliance-copy\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) main();
