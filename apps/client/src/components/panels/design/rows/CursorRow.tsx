import { useEffect, useRef, useState } from "react";
import { MousePointer2 } from "lucide-react";
import { CursorLayer } from "@repo/ui";
import type { EffectEntry } from "@repo/constants";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { useDesign } from "../kit/useDesign";
import { ParamPanel } from "../kit/ParamStrip";
import { CURSOR_TILES, cursorIndex, cursorPatch } from "../kit/cursorLook";

// Theme Engine v2 phase 3c (spec 3.5): the Cursor row, Motion tab, last row.
// Shown with themeShowcase. A tile runs its effect while hovered or focused,
// one at a time, on the creator's own background (decision 12). On a touch
// device the tiles stay still: cursor effects never render there.

const REDUCED_MOTION_LINE = "Your visitors with reduced motion see a still version.";

function CursorTile({
  entry,
  selected,
  focusable,
  live,
  onLive,
}: {
  entry: EffectEntry;
  selected: boolean;
  focusable: boolean;
  live: boolean;
  onLive: (id: string | null) => void;
}) {
  const { config, values, locked, update, preview, endPreview } = useDesign();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const colors = {
    button: values.buttonColor,
    buttonText: values.fontColor,
    container: values.containerColor,
    text: values.fontColor,
  };
  return (
    <OptionTile
      label={entry.label}
      accessibleDescription={entry.description}
      tier={entry.tier}
      cost={entry.cost}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update(cursorPatch(entry));
        onLive(entry.id);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onLive(null), 3000);
      }}
      onPreview={() => {
        preview(cursorPatch(entry));
        onLive(entry.id);
      }}
      onPreviewEnd={() => {
        endPreview();
        onLive(null);
      }}
      art={
        <CreatorBackdrop background={config.background}>
          <span className="relative flex h-full w-full items-center justify-center">
            {entry.id !== "cursor.none" && (
              <CursorLayer entry={entry} colors={colors} showcase paused={!live} device="typical" />
            )}
            <MousePointer2
              aria-hidden
              className="relative h-[21px] w-[21px]"
              style={{ color: values.fontColor }}
            />
          </span>
        </CreatorBackdrop>
      }
    />
  );
}

export function CursorRow() {
  const { config, locked, update, yourColors } = useDesign();
  const [live, setLive] = useState<string | null>(null);
  const selectedIndex = cursorIndex(config.cursorEffectId);
  const selected = CURSOR_TILES[selectedIndex]!;
  return (
    <DisclosureRow id="cursor" label="Cursor" value={selected.label}>
      <div className="space-y-[21px]">
        <OptionGrid label="Cursor">
          {CURSOR_TILES.map((entry, index) => (
            <CursorTile
              key={entry.id}
              entry={entry}
              selected={index === selectedIndex}
              focusable={index === selectedIndex}
              live={live === entry.id}
              onLive={setLive}
            />
          ))}
        </OptionGrid>
        {selected.id !== "cursor.none" && Object.keys(selected.params).length > 0 && (
          <ParamPanel
            entry={selected}
            stored={config.cursorParams}
            disabled={locked}
            yourColors={yourColors}
            onChange={params => update({ cursorParams: params })}
          />
        )}
        <p className="text-prism-meta text-prism-ink-2">
          Cursor effects need a pointer. Phones and tablets show your page without them, and your
          visitors keep their own cursor.
        </p>
        <p className="text-prism-meta text-prism-ink-2">{REDUCED_MOTION_LINE}</p>
      </div>
    </DisclosureRow>
  );
}
