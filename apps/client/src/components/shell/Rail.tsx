import { Fragment, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import {
  GROUP_LABELS,
  destinationForPanel,
  enabledDestinations,
  type Destination,
  type DestinationGroup,
} from "./destinations";
import { NavItemLink } from "./NavItemLink";
import { BrandMark } from "./BrandMark";

// Screen Review 001. The desktop rail: a vertical G1 navigate dock capsule at
// x 21, 89 wide, full height minus 21 top and bottom, padding 13. Seven
// destinations in three groups (D01). Items are 61 x 64 links, r27, icon 21
// over a 13/16 label. The current item carries the lens thumb with the 1.5px
// indigo ring and aria-current (I05). Rendered at 768 and up only (I10).
const GROUP_ORDER: DestinationGroup[] = ["start", "page", "money"];

export function Rail() {
  const { activePanel } = useEditor();
  const current = destinationForPanel(activePanel);
  const enabled = enabledDestinations();
  const navRef = useRef<HTMLElement>(null);
  const lens = useRailLens(navRef, `${current}:${enabled.length}`);

  return (
    <nav
      ref={navRef}
      aria-label="Editor"
      className="prism-dock fixed bottom-[21px] left-[21px] top-[21px] z-30 hidden w-[89px] overflow-y-auto rounded-prism-34 p-[13px] font-prism md:block"
    >
      {lens && (
        // One lens thumb glides to the new destination in panel time (#26, section 3.4)
        <span
          aria-hidden
          className={cn(
            "prism-lens-thumb pointer-events-none absolute left-0 top-0 h-16 w-[61px] rounded-[27px]",
            lens.animate &&
              "transition-transform duration-prism-panel ease-prism motion-reduce:transition-none"
          )}
          style={{ transform: `translate(${lens.x}px, ${lens.y}px)` }}
        />
      )}
      {/* QA-040: the Amplify mark heads the rail in the 55 slot the shell
          skeleton reserves (081). It is a Home link with a 44 target. */}
      <div className="mb-2 flex justify-center">
        <NavItemLink
          panel="home"
          current={false}
          className="flex h-[55px] w-[61px] items-center justify-center rounded-prism-13"
        >
          <BrandMark className="h-[26px] w-auto" />
          <span className="sr-only">Amped.Bio home</span>
        </NavItemLink>
      </div>
      {GROUP_ORDER.map((group, index) => {
        const items = enabled.filter(d => d.group === group);
        // A group label never sits above an empty group (I03)
        if (items.length === 0) return null;
        const label = GROUP_LABELS[group];
        return (
          <Fragment key={group}>
            {index > 0 && (
              <div aria-hidden className="mx-[13px] mb-2 mt-[21px] h-px bg-prism-line" />
            )}
            {label && (
              <p
                id={`rail-group-${group}`}
                className="mb-2 text-center text-prism-eyebrow uppercase text-prism-ink-2"
              >
                {label}
              </p>
            )}
            <ul
              aria-labelledby={label ? `rail-group-${group}` : undefined}
              className="flex flex-col items-center gap-2"
            >
              {items.map(item => (
                <li key={item.id}>
                  <RailItem item={item} current={current === item.id} />
                </li>
              ))}
            </ul>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Where the gliding lens sits: the current item's offset inside the rail. */
function useRailLens(navRef: RefObject<HTMLElement | null>, current: string) {
  const [lens, setLens] = useState<{ x: number; y: number; animate: boolean } | null>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !item) {
      setLens(null);
      placed.current = false;
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    setLens({
      // Absolute children sit inside the border, so take the border off
      x: box.left - navBox.left - nav.clientLeft + nav.scrollLeft,
      y: box.top - navBox.top - nav.clientTop + nav.scrollTop,
      animate: placed.current,
    });
    placed.current = true;
  }, [navRef, current]);
  return lens;
}

function RailItem({ item, current }: { item: Destination; current: boolean }) {
  const Icon = item.icon;
  return (
    <NavItemLink
      panel={item.id}
      current={current}
      className={cn(
        "relative flex h-16 w-[61px] flex-col items-center justify-center gap-[5px] rounded-[27px]",
        // The lens itself is the gliding element above; the item keeps its hover only when not current
        current ? "text-prism-nav-pressed" : "prism-dock-item"
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-[21px] w-[21px]",
          current ? "text-prism-nav-pressed" : item.id === "wallet" ? "text-prism-value-ink" : ""
        )}
        strokeWidth={1.5}
      />
      <span
        className={cn(
          "whitespace-nowrap text-prism-meta",
          current ? "font-bold text-prism-nav-pressed" : "font-medium text-prism-ink-2"
        )}
      >
        {item.label}
      </span>
    </NavItemLink>
  );
}
