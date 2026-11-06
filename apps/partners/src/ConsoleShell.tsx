import { NavLink, Outlet } from "react-router";
import { cn } from "@repo/ui";
import { useMerchant } from "./merchant";

const PAGES = [
  { to: "/", label: "Overview", end: true },
  { to: "/products", label: "Products" },
  { to: "/payout-wallet", label: "Payout wallet" },
  { to: "/orders", label: "Orders" },
  { to: "/developers", label: "Developers" },
  { to: "/team", label: "Team" },
];

const ON_TESTNET = import.meta.env.MODE !== "production";

/** The console frame (boards p1 to p6): a rail of six pages and the merchant name. */
export function ConsoleShell() {
  const merchant = useMerchant();
  return (
    <div className="prism-room min-h-dvh font-prism text-prism-ink">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-[21px] p-[16px] md:flex-row md:p-[21px]">
        <nav
          aria-label="Merchant Console"
          className="prism-glass-clear flex flex-col gap-1 !rounded-prism-21 p-[13px] md:w-[260px] md:shrink-0"
        >
          <div className="px-2 pb-[13px]">
            <p className="font-bold">{merchant.name}</p>
            <p className="text-prism-meta text-prism-ink-2">Merchant Console</p>
          </div>
          {PAGES.map(page => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.end}
              className={({ isActive }) =>
                cn(
                  "prism-focus flex min-h-touch items-center rounded-prism-13 px-3 text-prism-label",
                  isActive
                    ? "prism-lens-thumb font-bold text-prism-nav-pressed"
                    : "text-prism-ink-2"
                )
              }
            >
              {page.label}
            </NavLink>
          ))}
          {ON_TESTNET && (
            <p className="mx-2 mt-[13px] inline-flex h-[26px] items-center self-start rounded-prism-8 bg-prism-warning-bg px-2 text-prism-meta font-semibold text-prism-warning-ink">
              Staging, Base Sepolia
            </p>
          )}
        </nav>
        <main className="min-w-0 flex-1 space-y-[21px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
