import { Fragment, useEffect, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Link, useLocation } from "react-router";
import { BottomSheet, BottomSheetContent, Tooltip, cn } from "@repo/ui";
import {
  ADMIN_DESTINATIONS,
  GROUP_LABELS,
  GROUP_ORDER,
  destinationForPath,
  isMacPlatform,
  shortcutLabel,
  type AdminDestination,
} from "./destinations";

// Screen Review 087 I01 and I20 on the row 001 rail: a vertical G1 navigate
// dock capsule at x 21, 89 wide, full height minus 21. Items 61 x 64 r27,
// 21 icon over a 13/16 label; the current item carries the lens thumb with
// the indigo ring, a #302F5D 700 label and aria-current. Group eyebrows above
// Content, Money and Access. Rendered at 768 and up.

const itemBase =
  "prism-focus flex h-16 min-w-[61px] flex-col items-center justify-center gap-[5px] rounded-[27px] px-[3px]";

function ItemLabel({ current, children }: { current: boolean; children: string }) {
  return (
    <span
      className={cn(
        "max-w-[77px] text-center text-prism-meta leading-[16px]",
        current ? "font-bold text-prism-nav-pressed" : "font-medium text-prism-ink-2"
      )}
    >
      {children}
    </span>
  );
}

export function AdminRail() {
  const { pathname } = useLocation();
  const current = destinationForPath(pathname)?.id;
  const mac = isMacPlatform();

  return (
    <nav
      aria-label="Admin"
      className="prism-dock fixed bottom-[21px] left-[21px] top-[21px] z-30 hidden w-[89px] overflow-y-auto rounded-prism-34 px-[3px] py-[13px] font-prism md:block"
    >
      {GROUP_ORDER.map((group, index) => {
        const items = ADMIN_DESTINATIONS.filter(item => item.group === group);
        if (items.length === 0) return null;
        const label = GROUP_LABELS[group];
        return (
          <Fragment key={group}>
            {index > 0 && (
              <div aria-hidden className="mx-[13px] mb-2 mt-[21px] h-px bg-prism-line" />
            )}
            {label && (
              <p
                id={`admin-rail-${group}`}
                className="mb-2 flex flex-col items-center gap-[5px] text-center text-prism-eyebrow uppercase text-prism-ink-2"
              >
                <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
                {label}
              </p>
            )}
            <ul
              aria-labelledby={label ? `admin-rail-${group}` : undefined}
              className="flex flex-col items-center gap-2"
            >
              {items.map(item => {
                const isCurrent = current === item.id;
                const Icon = item.icon;
                const link = (
                  <Link
                    to={item.path}
                    aria-current={isCurrent ? "page" : undefined}
                    aria-keyshortcuts={
                      item.shortcut
                        ? `${mac ? "Meta" : "Control"}+Alt+${item.shortcut.replace("Key", "")}`
                        : undefined
                    }
                    className={cn(itemBase, isCurrent ? "prism-lens-thumb" : "prism-dock-item")}
                  >
                    <Icon
                      aria-hidden
                      className={cn("h-[21px] w-[21px]", isCurrent && "text-prism-nav-pressed")}
                      strokeWidth={1.5}
                    />
                    <ItemLabel current={isCurrent}>{item.label}</ItemLabel>
                  </Link>
                );
                return (
                  <li key={item.id}>
                    {item.shortcut ? (
                      <Tooltip
                        side="right"
                        content={`${item.label}, ${shortcutLabel(item.shortcut, mac)}`}
                      >
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Hides the dock while the on screen keyboard is open (row 003 I08). */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "TEXTAREA" ||
          (active.tagName === "INPUT" &&
            !["checkbox", "radio", "button", "submit", "file"].includes(
              (active as HTMLInputElement).type
            )));
      setOpen(typing && viewport.height < window.innerHeight * 0.8);
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return open;
}

// 087 I01, I20 at 767 and below: the bottom dock holds Dashboard, Users,
// Pools, Conversions and More; More opens a sheet with Themes, Files,
// Broadcasts and OAuth clients.
export function AdminMobileDock() {
  const { pathname } = useLocation();
  const current = destinationForPath(pathname)?.id;
  const [sheetOpen, setSheetOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const dock = ADMIN_DESTINATIONS.filter(item => item.dock);
  const more = ADMIN_DESTINATIONS.filter(item => !item.dock);
  const moreCurrent = more.find(item => item.id === current);

  return (
    <>
      <nav
        aria-label="Admin"
        className={cn(
          "prism-dock fixed inset-x-[13px] bottom-[calc(13px+env(safe-area-inset-bottom,0px))] z-30 rounded-prism-34 p-2 font-prism md:hidden",
          "transition-transform duration-prism-control ease-prism motion-reduce:transition-none",
          keyboardOpen && "translate-y-[calc(100%+21px+env(safe-area-inset-bottom,0px))]"
        )}
      >
        <ul className="flex items-end justify-between gap-[3px]">
          {dock.map(item => (
            <li key={item.id}>
              <DockLink item={item} current={current === item.id} />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              className={cn(itemBase, moreCurrent ? "prism-dock-lens" : "prism-dock-item")}
            >
              <MoreHorizontal
                aria-hidden
                className={cn("h-[21px] w-[21px]", moreCurrent && "text-prism-nav-pressed")}
                strokeWidth={1.5}
              />
              <ItemLabel current={!!moreCurrent}>More</ItemLabel>
              {moreCurrent && <span className="sr-only">, current: {moreCurrent.label}</span>}
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheetContent title="More">
          <ul className="divide-y divide-prism-line">
            {more.map(item => {
              const Icon = item.icon;
              const isCurrent = current === item.id;
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "prism-focus flex min-h-commit items-center gap-3 rounded-prism-13 px-2 text-prism-label font-semibold text-prism-ink",
                      isCurrent ? "prism-lens-thumb" : "prism-dock-item"
                    )}
                  >
                    <Icon aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.5} />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

function DockLink({ item, current }: { item: AdminDestination; current: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      aria-current={current ? "page" : undefined}
      className={cn(itemBase, current ? "prism-dock-lens" : "prism-dock-item")}
    >
      <Icon
        aria-hidden
        className={cn("h-[21px] w-[21px]", current && "text-prism-nav-pressed")}
        strokeWidth={1.5}
      />
      <ItemLabel current={current}>{item.label}</ItemLabel>
    </Link>
  );
}
