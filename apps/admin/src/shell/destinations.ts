import {
  CircleDollarSign,
  Coins,
  FileText,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Store,
  MessageCircle,
  Palette,
  ShieldCheck,
  ToggleRight,
  Users,
  type LucideIcon,
} from "lucide-react";

// Screen Review 087 I01, I04, I20. The admin rail: unlabeled Dashboard, Users;
// Content: Themes, Files; Money: Pools, USDC; Access: OAuth clients.
// Blocks is not rendered (088 I09). Broadcasts shipped after the review and
// Blocks is not rendered (088 I09). Broadcasts shipped after the review and
// sits in Content so its page stays reachable. Telegram (Build Board #2, row
// 120) sits beside it: reports, paused senders, the pilot and bot health. USDC
// (Build Board #29, spec 3.8) joins Money after Pools, and Payments (AmpedPay,
// Build Board #50, spec docs/features/ampedpay.md 3.8) after USDC. ndau conversions were
// removed from the admin: they are processed manually through the support
// portal. Feature flags (site_settings) sit in Access after OAuth clients.
// Safety (Build Board #28, adult content review 8 and 8.8, PR R1) sits between
// Content and Money with one destination, Review. Moderators and safety leads see
// it; admin alone does not.
export type AdminGroup = "start" | "content" | "safety" | "money" | "access";

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
  /** Roles that see it. Admin only when left out. Moderators see Messaging (M7). */
  roles?: AdminRole[];
}

export type AdminRole = "admin" | "moderator" | "safety_lead";

const ADMIN_ROLES: readonly AdminRole[] = ["admin", "moderator", "safety_lead"];

export const GROUP_LABELS: Record<AdminGroup, string | null> = {
  start: null,
  content: "Content",
  safety: "Safety",
  money: "Money",
  access: "Access",
};

export const GROUP_ORDER: AdminGroup[] = ["start", "content", "safety", "money", "access"];

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
  // Amped Messages (Build Board #2 r4, M7, board m6): replaces Telegram in the rail. It
  // moves under Safety when Adult Content Review ships. /telegram stays reachable (no rail
  // item) for bot health and groups until M8 removes Telegram.
  {
    id: "messaging",
    path: "/messaging",
    label: "Messaging",
    title: "Messaging",
    icon: MessageCircle,
    group: "content",
    dock: false,
    roles: ["admin", "moderator"],
  },
  {
    id: "safety",
    path: "/safety",
    label: "Review",
    title: "Review",
    icon: ShieldCheck,
    group: "safety",
    shortcut: "KeyR",
    dock: true,
    roles: ["moderator", "safety_lead"],
  },
  {
    id: "pools",
    path: "/pools",
    label: "Pools",
    title: "Pools",
    icon: Coins,
    group: "money",
    shortcut: "KeyP",
    // Phone dock: Dashboard, Users, Review, USDC, More (8, QA AD-Q36)
    dock: false,
  },
  {
    id: "money",
    path: "/money",
    label: "USDC",
    title: "USDC money",
    icon: CircleDollarSign,
    group: "money",
    shortcut: "KeyM",
    dock: true,
  },
  {
    id: "payments",
    path: "/payments",
    label: "Payments",
    title: "Payments",
    icon: Landmark,
    group: "money",
    dock: false,
  },
  // Business sellers on AmpedPay, Authbase first (Build Board #66, AB-1, board a1)
  {
    id: "merchants",
    path: "/merchants",
    label: "Merchants",
    title: "Merchants",
    icon: Store,
    group: "money",
    dock: false,
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
  {
    id: "feature-flags",
    path: "/feature-flags",
    label: "Feature flags",
    title: "Feature flags",
    icon: ToggleRight,
    group: "access",
    dock: false,
  },
];

/** The account's roles from the comma separated session role ("admin,moderator"). */
export function rolesOf(role: string | null | undefined): AdminRole[] {
  return (role ?? "")
    .split(",")
    .map(r => r.trim())
    .filter((r): r is AdminRole => (ADMIN_ROLES as readonly string[]).includes(r));
}

/** Destinations this account may open, in rail order. */
export function destinationsFor(role: string | null | undefined): AdminDestination[] {
  const roles = rolesOf(role);
  return ADMIN_DESTINATIONS.filter(item => (item.roles ?? ["admin"]).some(r => roles.includes(r)));
}

/** True for an account that holds moderator or safety_lead but not admin. */
export function isModeratorOnly(role: string | null | undefined) {
  const roles = rolesOf(role);
  return roles.length > 0 && !roles.includes("admin");
}

/** Where a non admin lands: the first destination their roles open. */
export function homeFor(role: string | null | undefined): string {
  return destinationsFor(role)[0]?.path ?? "/";
}

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
