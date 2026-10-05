import { useEffect, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { BottomSheet, BottomSheetContent, cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { destinationForPanel, dockComposition, type Destination } from "./destinations";
import { NavItemLink } from "./NavItemLink";

// Screen Review 003. Mobile bottom dock (D09): a dock capsule 21 from the
// left, right and bottom edges above the safe area, padding 8, items 61 x 64.
// The current item rises in the dock lens with the indigo ring. More opens a
// bottom sheet with the remaining destinations. Rendered below 768 only.

/** Hides the dock while the on screen keyboard is open (I08). */
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
            !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(
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

const itemClass =
  "flex h-16 w-[61px] flex-col items-center justify-center gap-[5px] rounded-[27px]";

function DockLabel({ current, children }: { current: boolean; children: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap text-prism-meta",
        current ? "font-bold text-prism-nav-pressed" : "font-medium text-prism-ink-2"
      )}
    >
      {children}
    </span>
  );
}

export function MobileDock() {
  const { activePanel } = useEditor();
  const current = destinationForPanel(activePanel);
  const { dock, more } = dockComposition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const moreCurrent = more.some(d => d.id === current);

  return (
    <>
      <nav
        aria-label="Editor"
        className={cn(
          "prism-dock fixed inset-x-[21px] bottom-[calc(21px+env(safe-area-inset-bottom,0px))] z-30 rounded-prism-34 p-2 font-prism md:hidden",
          "transition-transform duration-prism-control ease-prism motion-reduce:transition-none",
          keyboardOpen && "translate-y-[calc(100%+21px+env(safe-area-inset-bottom,0px))]"
        )}
      >
        <ul className="flex items-end justify-between gap-[3px]">
          {dock.map(item => (
            <li key={item.id}>
              <DockItem item={item} current={current === item.id} />
            </li>
          ))}
          {more.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                className={cn(
                  itemClass,
                  "prism-focus",
                  moreCurrent ? "prism-dock-lens" : "prism-dock-item"
                )}
              >
                <MoreHorizontal
                  aria-hidden
                  className={cn("h-[21px] w-[21px]", moreCurrent && "text-prism-nav-pressed")}
                  strokeWidth={1.5}
                />
                <DockLabel current={moreCurrent}>More</DockLabel>
                {moreCurrent && (
                  <span className="sr-only">
                    , current: {more.find(d => d.id === current)?.label}
                  </span>
                )}
              </button>
            </li>
          )}
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
                  <NavItemLink
                    panel={item.id}
                    current={isCurrent}
                    onNavigate={() => setSheetOpen(false)}
                    className={cn(
                      "flex min-h-commit items-center gap-3 rounded-prism-13 px-2 text-prism-label font-semibold text-prism-ink",
                      isCurrent ? "prism-lens-thumb" : "prism-dock-item text-prism-ink"
                    )}
                  >
                    <Icon aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.5} />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
                  </NavItemLink>
                </li>
              );
            })}
          </ul>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

function DockItem({ item, current }: { item: Destination; current: boolean }) {
  const Icon = item.icon;
  return (
    <NavItemLink
      panel={item.id}
      current={current}
      className={cn(itemClass, current ? "prism-dock-lens" : "prism-dock-item")}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-[21px] w-[21px]",
          current ? "text-prism-nav-pressed" : item.id === "wallet" ? "text-prism-value-ink" : ""
        )}
        strokeWidth={1.5}
      />
      <DockLabel current={current}>{item.label}</DockLabel>
    </NavItemLink>
  );
}
