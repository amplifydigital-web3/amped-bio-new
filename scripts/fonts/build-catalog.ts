#!/usr/bin/env tsx

/**
 * Font catalog build step (Theme Engine v2, docs/features/theme-engine-v2.md 3.8).
 *
 * Writes packages/constants/src/fonts/catalog.json: every Google Fonts family
 * with its category, static weights, italics, variable axes (wght, wdth,
 * opsz) with ranges, language subsets and a popularity rank. The editor loads
 * the file lazily when the Text row opens. The finished file is committed, so
 * builds never call out and the lockfile stays as it is.
 *
 * Family data comes from Fontsource's google-font-metadata package, a public
 * mirror of the Google Fonts Developer API that needs no key:
 *
 *   npm pack google-font-metadata && tar xzf google-font-metadata-*.tgz
 *   pnpm exec tsx scripts/fonts/build-catalog.ts --from ./package/data
 *
 * Popularity: with GOOGLE_FONTS_API_KEY set, ranks come from the Developer
 * API's popularity sort. Without a key, the curated POPULAR list below ranks
 * the shelf and every other family is unranked (listed by name after it).
 * The catalog records which source it used.
 */

import fs from "fs/promises";
import path from "path";
import type {
  FontAxis,
  FontCatalog,
  FontCatalogEntry,
  FontCategory,
} from "../../packages/constants/src/fonts/types";

const OUT = path.resolve(__dirname, "../../packages/constants/src/fonts/catalog.json");

const CATEGORY: Record<string, FontCategory> = {
  serif: "serif",
  "sans-serif": "sans",
  display: "display",
  handwriting: "handwriting",
  monospace: "mono",
};

const AXES: readonly FontAxis[] = ["wght", "wdth", "opsz"];

/**
 * Curated rank, used when no API key is set: the families creators reach for
 * most often, widest first. Every name must exist in the metadata; the build
 * fails on a missing one so the list cannot drift silently.
 */
const POPULAR = [
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Poppins",
  "Inter",
  "Lato",
  "Playfair Display",
  "Oswald",
  "Raleway",
  "Nunito",
  "Bebas Neue",
  "DM Sans",
  "Space Grotesk",
  "Lora",
  "Merriweather",
  "Rubik",
  "Work Sans",
  "Fraunces",
  "Syne",
  "Bricolage Grotesque",
  "Instrument Serif",
  "DM Serif Display",
  "Manrope",
  "Outfit",
  "Figtree",
  "Plus Jakarta Sans",
  "Quicksand",
  "Kanit",
  "Mulish",
  "Source Sans 3",
  "Archivo",
  "Barlow",
  "Josefin Sans",
  "Cormorant Garamond",
  "EB Garamond",
  "Libre Baskerville",
  "Abril Fatface",
  "Anton",
  "Pacifico",
  "Dancing Script",
  "Caveat",
  "Permanent Marker",
  "Righteous",
  "Unbounded",
  "Space Mono",
  "JetBrains Mono",
  "IBM Plex Sans",
  "Sora",
];

interface MetadataFamily {
  family: string;
  category: string;
  weights: number[];
  styles: string[];
  subsets: string[];
}

interface VariableFamily {
  family: string;
  axes: Record<string, { min: string; max: string }>;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function apiRanks(key: string): Promise<Map<string, number>> {
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Fonts API answered ${response.status}`);
  const body = (await response.json()) as { items: { family: string }[] };
  return new Map(body.items.map((item, index) => [item.family, index + 1]));
}

async function main() {
  const from = arg("--from");
  if (!from) {
    console.error(
      "Usage: tsx scripts/fonts/build-catalog.ts --from <google-font-metadata data dir>"
    );
    process.exit(1);
  }
  const pkg = await readJson<{ version?: string }>(path.join(from, "..", "package.json")).catch(
    () => ({ version: undefined })
  );
  const families = await readJson<Record<string, MetadataFamily>>(
    path.join(from, "google-fonts-v1.json")
  );
  const variable = await readJson<Record<string, VariableFamily>>(path.join(from, "variable.json"));
  const axesByFamily = new Map(Object.values(variable).map(v => [v.family, v.axes]));

  const key = process.env.GOOGLE_FONTS_API_KEY;
  let ranks: Map<string, number>;
  let popularity: FontCatalog["popularity"];
  if (key) {
    ranks = await apiRanks(key);
    popularity = "api";
  } else {
    const known = new Set(Object.values(families).map(f => f.family));
    const missing = POPULAR.filter(name => !known.has(name));
    if (missing.length > 0) throw new Error(`POPULAR names missing: ${missing.join(", ")}`);
    ranks = new Map(POPULAR.map((name, index) => [name, index + 1]));
    popularity = "curated";
  }

  const entries: FontCatalogEntry[] = [];
  for (const family of Object.values(families)) {
    const category = CATEGORY[family.category];
    if (!category) throw new Error(`Unknown category ${family.category} on ${family.family}`);
    if (!/^[A-Za-z0-9 ]{1,80}$/.test(family.family)) {
      throw new Error(`Family name outside the allowed characters: ${family.family}`);
    }
    const entry: FontCatalogEntry = {
      f: family.family,
      c: category,
      w: [...family.weights].sort((a, b) => a - b),
      s: [...family.subsets].sort(),
    };
    const rank = ranks.get(family.family);
    if (rank !== undefined) entry.r = rank;
    if (family.styles.includes("italic")) entry.i = 1;
    const axes = axesByFamily.get(family.family);
    if (axes) {
      const picked: FontCatalogEntry["a"] = {};
      for (const axis of AXES) {
        const range = axes[axis];
        if (range) picked[axis] = [Number(range.min), Number(range.max)];
      }
      if (Object.keys(picked).length > 0) entry.a = picked;
    }
    entries.push(entry);
  }
  entries.sort((a, b) => a.f.localeCompare(b.f));

  const catalog: FontCatalog = {
    source: `google-font-metadata ${pkg.version ?? "unknown"}`,
    popularity,
    count: entries.length,
    families: entries,
  };
  await fs.writeFile(OUT, `${JSON.stringify(catalog)}\n`);
  console.log(`Wrote ${entries.length} families (${popularity} popularity) to ${OUT}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
