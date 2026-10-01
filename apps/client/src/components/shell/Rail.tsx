import { Fragment } from "react";
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

  return (
    <nav
      aria-label="Editor"
      className="prism-dock fixed bottom-[21px] left-[21px] top-[21px] z-30 hidden w-[89px] overflow-y-auto rounded-prism-34 p-[13px] font-prism md:block"
    >
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

function RailItem({ item, current }: { item: Destination; current: boolean }) {
  const Icon = item.icon;
  return (
    <NavItemLink
      panel={item.id}
      current={current}
      className={cn(
        "flex h-16 w-[61px] flex-col items-center justify-center gap-[5px] rounded-[27px]",
        current ? "prism-lens-thumb" : "prism-dock-item"
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
