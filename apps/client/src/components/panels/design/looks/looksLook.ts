import { pageCost, upgradeTheme, type ThemeConfig } from "@repo/constants";

// Theme Engine v2 TE-4c, the Themes tab (spec 3.10, boards 04, 11, 13).

export const LOOK_LIMIT = 10;

/** "Saved just now", "Saved 5 min ago", "Saved 3 h ago", "Saved Nov 1". */
export function savedLine(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return "Not saved yet";
  const date = typeof at === "string" ? new Date(at) : at;
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes} min ago`;
  if (minutes < 24 * 60) return `Saved ${Math.floor(minutes / 60)} h ago`;
  return `Saved ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** "4 of 10". */
export function limitLine(count: number, limit: number = LOOK_LIMIT): string {
  return `${Math.min(count, limit)} of ${limit}`;
}

export const LIMIT_REASON = "You have 10 looks. Delete one to save a new look.";

/** Where a Layers chip jumps (each chip opens its row, board 04). */
export const LAYER_TARGETS: Record<
  string,
  { tab: "style" | "motion"; row: string; storageKey: string; label: string }
> = {
  scene: {
    tab: "motion",
    row: "particles",
    storageKey: "amped:design-motion-open",
    label: "Scene",
  },
  container: {
    tab: "style",
    row: "container",
    storageKey: "amped:design-style-open",
    label: "Container",
  },
  button: { tab: "style", row: "buttons", storageKey: "amped:design-style-open", label: "Buttons" },
  buttonHover: {
    tab: "motion",
    row: "button-hover",
    storageKey: "amped:design-motion-open",
    label: "Button hover",
  },
  buttonPress: {
    tab: "motion",
    row: "button-press",
    storageKey: "amped:design-motion-open",
    label: "Button press",
  },
  name: {
    tab: "motion",
    row: "name-effect",
    storageKey: "amped:design-motion-open",
    label: "Name",
  },
};

/** Opens a row on its tab's next mount: the row group reads its stored row. */
export function openRowNext(layer: string): "style" | "motion" | null {
  const target = LAYER_TARGETS[layer];
  if (!target) return null;
  try {
    localStorage.setItem(target.storageKey, target.row);
  } catch {
    // Storage blocked: the tab opens on its default row
  }
  return target.tab;
}

/** The cost line in the spec's words (3.7). */
export function lookCostLine(config: ThemeConfig | null | undefined): string {
  const cost = pageCost(upgradeTheme(config ?? {}));
  const n = cost.parts.length;
  if (cost.level === "still" || n === 0) return "Still. Nothing on your page moves.";
  const effects = `${n} ${n === 1 ? "effect" : "effects"}`;
  return cost.level === "heavy"
    ? `Heavy, ${effects}. Slower phones show the still version.`
    : `Light, ${effects}.`;
}

/** Collections Light only (board 04): heavy looks drop out. */
export function isHeavy(config: ThemeConfig | null | undefined): boolean {
  return pageCost(upgradeTheme(config ?? {})).level === "heavy";
}

/**
 * Shared with me (spec 3.10): looks opened from share links and not yet
 * saved, kept in this browser. The editor records a link when it opens with
 * ?look=<slug> (the link page's Try it in your editor).
 */
export const SHARED_KEY = "amped.sharedLooks";
const SHARED_MAX = 12;

export interface SharedEntry {
  slug: string;
  name: string;
  author: string | null;
  openedAt: string;
}

export function readShared(): SharedEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SHARED_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (e): e is SharedEntry =>
            e &&
            typeof e.slug === "string" &&
            /^[a-z2-7]{8}$/.test(e.slug) &&
            typeof e.name === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function writeShared(list: SharedEntry[]) {
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(list.slice(0, SHARED_MAX)));
  } catch {
    // Storage blocked: the list lives for this visit only
  }
}

/** Adds a look to the front of the list (once per slug). */
export function rememberShared(entry: SharedEntry): SharedEntry[] {
  const next = [entry, ...readShared().filter(e => e.slug !== entry.slug)].slice(0, SHARED_MAX);
  writeShared(next);
  return next;
}

export function forgetShared(slug: string): SharedEntry[] {
  const next = readShared().filter(e => e.slug !== slug);
  writeShared(next);
  return next;
}

export const LOOKS_COPY = {
  current: "Current look",
  myLooks: "My looks",
  saveAsNew: "Save as new look",
  copyLink: "Copy share link",
  editStyle: "Edit style",
  importFile: "Import file",
  shared: "Shared with me",
  sharedEmpty: "Looks you open from a share link show here until you save them.",
  week: "Theme of the week",
  lightOnly: "Light only",
  deleteApplied: "Apply another look before you delete this one.",
  historyEmpty: "No versions yet. Each editing session saves one.",
} as const;
