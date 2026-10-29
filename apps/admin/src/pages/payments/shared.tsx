import { NavLink } from "react-router";
import { cn, type RouterOutputs } from "@repo/ui";
import type { PaymentTarget } from "@repo/constants";
import { WordBadge, type BadgeTone } from "../../kit/WordBadge";

// Admin, Payments (Build Board #50, spec docs/features/ampedpay.md 3.8). Shared pieces for
// boards a1 to a4: the page nav, the Where badge, status badges and value inputs.

export type PaymentsViewer = RouterOutputs["admin"]["payments"]["viewer"];
export type PaymentsOverviewData = RouterOutputs["admin"]["payments"]["overview"];
export type PaymentsSettingsData = RouterOutputs["admin"]["payments"]["settings"];
export type PaymentSettingRow = PaymentsSettingsData["items"][number];
export type PaymentChange = RouterOutputs["admin"]["payments"]["changes"]["list"]["items"][number];
export type PaymentSafeDetails = NonNullable<RouterOutputs["admin"]["payments"]["changes"]["safe"]>;

const PAGES = [
  { to: "/payments", label: "Overview", end: true },
  { to: "/payments/settings", label: "Settings", end: false },
  { to: "/payments/log", label: "Change log", end: false },
];

/** The three Payments pages as one row of lens chips (a1 to a4 headers). */
export function PaymentsNav() {
  return (
    <nav aria-label="Payments pages" className="flex flex-wrap gap-2 font-prism">
      {PAGES.map(page => (
        <NavLink
          key={page.to}
          to={page.to}
          end={page.end}
          className={({ isActive }) =>
            cn(
              "prism-focus inline-flex h-touch items-center rounded-full px-5 text-prism-label font-semibold",
              isActive ? "prism-lens-thumb text-prism-nav-pressed" : "prism-chip text-prism-ink-2"
            )
          }
        >
          {page.label}
        </NavLink>
      ))}
    </nav>
  );
}

const TARGET: Record<PaymentTarget, { label: string; tone: BadgeTone }> = {
  server: { label: "Server", tone: "nav" },
  contract: { label: "On chain", tone: "ink" },
  fixed: { label: "Fixed", tone: "neutral" },
};

/** Where a value lives: Server (saved by Amped.Bio), On chain (the contract), Fixed. */
export function WhereBadge({ target }: { target: string }) {
  const entry = TARGET[target as PaymentTarget] ?? TARGET.server;
  return <WordBadge tone={entry.tone}>{entry.label}</WordBadge>;
}

/**
 * Status words for a change (spec 3.7). Approved with a future date reads Scheduled; an on
 * chain change reads In the Safe from approval until the indexer sees it executed.
 */
export function changeStatus(change: Pick<PaymentChange, "status" | "scheduled">): {
  label: string;
  tone: BadgeTone;
} {
  if (change.scheduled) return { label: "Scheduled", tone: "nav" };
  switch (change.status) {
    case "draft":
      return { label: "Waiting", tone: "warning" };
    case "approved":
    case "proposed":
      return { label: "In the Safe", tone: "warning" };
    case "applied":
      return { label: "Applied", tone: "success" };
    case "rejected":
      return { label: "Rejected", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "superseded":
      return { label: "Superseded", tone: "neutral" };
  }
}

export function StatusBadge({ change }: { change: Pick<PaymentChange, "status" | "scheduled"> }) {
  const status = changeStatus(change);
  return <WordBadge tone={status.tone}>{status.label}</WordBadge>;
}

/** @handle, or the user id when the account has no handle. Id 0 is a change made in the Safe. */
export function who(handle: string | null, id: number | null): string {
  if (handle) return `@${handle}`;
  if (id === 0) return "Safe owners";
  return id ? `User ${id}` : "";
}

/* ------------------------------------------------------- value input conversion */

/** "4.50" (percent) to "450" basis points. Null when it is not a number with 2 decimals. */
export function percentToBps(text: string): string | null {
  const trimmed = text.trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return String(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}

export function bpsToPercent(bps: string): string {
  return (Number(bps) / 100).toFixed(2);
}

/** "1,000.50" USDC to micro units. Null when it is not an amount with up to 6 decimals. */
export function usdcToUnits(text: string): string | null {
  const trimmed = text
    .trim()
    .replace(/,/g, "")
    .replace(/\s*USDC$/i, "");
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return (BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

export function unitsToUsdc(units: string): string {
  const value = BigInt(units || "0");
  const whole = value / 1_000_000n;
  const rest = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return rest.length > 0
    ? `${whole}.${rest.length < 2 ? rest.padEnd(2, "0") : rest}`
    : `${whole}.00`;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
