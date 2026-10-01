import {
  BarChart3,
  Coins,
  Home,
  LayoutPanelTop,
  Palette,
  Search,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { EditorPanelType } from "@/types/editor";

// The seven editor destinations in D01 order (Screen Review 001 I01, I11).
export type DestinationId =
  | "home"
  | "explore"
  | "page"
  | "design"
  | "analytics"
  | "wallet"
  | "my-pool";

export type DestinationGroup = "start" | "page" | "money";

export interface Destination {
  id: DestinationId;
  label: string;
  icon: LucideIcon;
  group: DestinationGroup;
  /** Environment flag that must be "true"; no flag means always rendered */
  flag?: string;
}

export const DESTINATIONS: Destination[] = [
  { id: "home", label: "Home", icon: Home, group: "start" },
  { id: "explore", label: "Explore", icon: Search, group: "start" },
  { id: "page", label: "Page", icon: LayoutPanelTop, group: "page" },
  { id: "design", label: "Design", icon: Palette, group: "page" },
  { id: "analytics", label: "Analytics", icon: BarChart3, group: "page" },
  { id: "wallet", label: "Wallet", icon: Wallet, group: "money", flag: "VITE_SHOW_WALLET" },
  { id: "my-pool", label: "My Pool", icon: Coins, group: "money", flag: "VITE_SHOW_CREATOR_POOL" },
];

// Group eyebrows. The Start group has no label (I03).
export const GROUP_LABELS: Record<DestinationGroup, string | null> = {
  start: null,
  page: "Page",
  money: "Money",
};

export function isFlagOn(flag?: string) {
  return !flag || import.meta.env[flag] === "true";
}

/** Destinations whose flag is on. Flag off items are not rendered (D07, I04). */
export function enabledDestinations() {
  return DESTINATIONS.filter(d => isFlagOn(d.flag));
}

/**
 * The destination a panel belongs to, for the rail's current item.
 * Pay and RNS live under Wallet (D05, D06). Account and the hidden panels
 * belong to no rail item.
 */
export function destinationForPanel(panel: EditorPanelType): DestinationId | null {
  switch (panel) {
    case "pay":
    case "rns":
      return "wallet";
    case "home":
    case "explore":
    case "page":
    case "design":
    case "analytics":
    case "wallet":
    case "my-pool":
      return panel;
    default:
      return null;
  }
}

/** Top bar title per panel (002 I09, I13). The tab name follows after a comma. */
export const PANEL_TITLES: Record<EditorPanelType, string> = {
  home: "Home",
  explore: "Explore",
  page: "Page",
  design: "Design",
  analytics: "Analytics",
  wallet: "Wallet",
  "my-pool": "My Pool",
  account: "Account",
  pay: "Wallet",
  rns: "Wallet",
  reward: "Reward",
  rewardPools: "Reward pools",
  leaderboard: "Leaderboard",
};

/** Destinations with autosaved fields show the save status (002 I01, I13). */
export const SAVE_STATUS_PANELS: EditorPanelType[] = ["page", "design"];

/** Money destinations show the wallet chip when a wallet exists (002 I07). */
export const WALLET_CHIP_PANELS: EditorPanelType[] = ["wallet", "my-pool", "explore", "pay", "rns"];

/**
 * Mobile dock composition (003 I04, I12). With five or fewer enabled
 * destinations all sit in the dock and More is not rendered. Otherwise the
 * dock is Home, Page, Design, Wallet and More, and the More sheet lists the
 * rest in D01 order.
 */
export function dockComposition(enabled: Destination[] = enabledDestinations()) {
  if (enabled.length <= 5) return { dock: enabled, more: [] as Destination[] };
  const dockIds: DestinationId[] = ["home", "page", "design", "wallet"];
  const dock = dockIds
    .map(id => enabled.find(d => d.id === id))
    .filter((d): d is Destination => Boolean(d));
  // If Wallet is off but six or more remain, fill the fourth slot in D01 order
  for (const d of enabled) {
    if (dock.length >= 4) break;
    if (!dock.includes(d)) dock.push(d);
  }
  const more = enabled.filter(d => !dock.includes(d));
  return { dock, more };
}
