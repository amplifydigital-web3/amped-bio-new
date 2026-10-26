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
 * Run: `pnpm run check:copy` (also a step in .github/workflows/typecheck-build.yml).
 * Exit code 1 on any hit, with the string and the phrase that matched.
 */

import {
  ALL_EFFECTS,
  TELEGRAM_BANNED_PHRASES,
  TELEGRAM_COPY_EXEMPT,
  collectTelegramCopy,
  findBannedTerms,
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

/** Effect names say what the eye sees (decision 10): no banned words, no dashes. */
export function checkEffectCopy(strings: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const text of strings) {
    for (const hit of findBannedTerms(text)) {
      hits.push({ text, phrase: hit.phrase, rule: `broadcast:${hit.category}` });
    }
    if (/[–—]/.test(text)) hits.push({ text, phrase: "dash", rule: "effects:dash" });
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
  if (!telegramOk || !effectsOk) process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /check-compliance-copy\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) main();
