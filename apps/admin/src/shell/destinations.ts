import {
  ArrowLeftRight,
  Coins,
  FileText,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Palette,
  Users,
  type LucideIcon,
} from "lucide-react";

// Screen Review 087 I01, I04, I20. The admin rail: unlabeled Dashboard, Users;
// Content: Themes, Files; Money: Pools, Conversions; Access: OAuth clients.
// Blocks is not rendered (088 I09). Broadcasts shipped after the review and
// sits in Content so its page stays reachable.
export type AdminGroup = "start" | "content" | "money" | "access";

export interface AdminDestination {
  id: string;
  path: string;
  label: string;
  // The one page title in the top bar (087 I02)
  title: string;
  icon: LucideIcon;
  group: AdminGroup;
  // event.code used with Cmd or Ctrl plus Alt (087 I04, I21)
  shortcut?: string;
  // In the mobile dock; the rest go to the More sheet
  dock: boolean;
}

export const GROUP_LABELS: Record<AdminGroup, string | null> = {
  start: null,
  content: "Content",
  money: "Money",
  access: "Access",
};

export const GROUP_ORDER: AdminGroup[] = ["start", "content", "money", "access"];

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  {
    id: "dashboard",
    path: "/",
    label: "Dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    group: "start",
    shortcut: "KeyD",
    dock: true,
  },
  {
    id: "users",
    path: "/users",
    label: "Users",
    title: "Users",
    icon: Users,
    group: "start",
    shortcut: "KeyU",
    dock: true,
  },
  {
    id: "themes",
    path: "/themes",
    label: "Themes",
    title: "Themes",
    icon: Palette,
    group: "content",
    shortcut: "KeyT",
    dock: false,
  },
  {
    id: "files",
    path: "/files",
    label: "Files",
    title: "Files",
    icon: FileText,
    group: "content",
    shortcut: "KeyF",
    dock: false,
  },
  {
    id: "broadcasts",
    path: "/broadcasts",
    label: "Broadcasts",
    title: "Broadcasts",
    icon: Megaphone,
    group: "content",
    dock: false,
  },
  {
    id: "pools",
    path: "/pools",
    label: "Pools",
    title: "Pools",
    icon: Coins,
    group: "money",
    shortcut: "KeyP",
    dock: true,
  },
  {
    id: "ndau-conversions",
    path: "/ndau-conversions",
    label: "Conversions",
    title: "ndau conversions",
    icon: ArrowLeftRight,
    group: "money",
    shortcut: "KeyN",
    dock: true,
  },
  {
    id: "oauth-clients",
    path: "/oauth-clients",
    label: "OAuth clients",
    title: "OAuth clients",
    icon: KeyRound,
    group: "access",
    shortcut: "KeyO",
    dock: false,
  },
];

/** The destination for a path; nested paths (/themes/new) belong to their parent. */
export function destinationForPath(pathname: string): AdminDestination | undefined {
  if (pathname === "/") return ADMIN_DESTINATIONS[0];
  return ADMIN_DESTINATIONS.find(item => item.path !== "/" && pathname.startsWith(item.path));
}

/** Shortcut text for tooltips and the shortcuts dialog. */
export function shortcutLabel(code: string, mac: boolean): string {
  const key = code.replace(/^Key/, "");
  return mac ? `⌘ ⌥ ${key}` : `Ctrl Alt ${key}`;
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}
