import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nameSettle, isNameEntrance, NAME_SETTLES, NAME_TARGETS } from "@repo/constants";
import {
  ChipGroup,
  NameText,
  cn,
  effectClassName,
  themeCssVars,
  usePrefersReducedMotion,
} from "@repo/ui";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { cardFill, formatRatio, useDesign } from "../kit/useDesign";
import { ParamPanel } from "../kit/ParamStrip";
import {
  NAME_TILES,
  nameIndex,
  namePaintedColors,
  namePatch,
  nameRowValue,
  type NameTile,
} from "../kit/nameLook";

// Theme Engine v2 phase 2, Name row (board 08, spec 3.5). Behind
// VITE_SHOW_THEME_V2; the v1 row stays in MotionRows.tsx.

const SETTLE_LABELS = { once: "Play once", always: "Loop" } as const;
const TARGET_LABELS = { name: "Name", nameAndBio: "Name and bio" } as const;

/** Plays for a moment after a tap or selection. */
function usePlay() {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const playFor = (ms: number) => {
    setPlaying(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), ms);
  };
  return { playing, setPlaying, playFor };
}

function NameTileView({
  tile,
  selected,
  focusable,
}: {
  tile: NameTile;
  selected: boolean;
  focusable: boolean;
}) {
  const { config, values, profile, locked, update, preview, endPreview } = useDesign();
  const reducedMotion = usePrefersReducedMotion();
  const { playing, setPlaying, playFor } = usePlay();
  const look = { ...config, ...values };
  const { entry } = tile;
  // Animated effects play only on hover, focus or tap in tiles (030 I02)
  const animated = entry.loop === true || isNameEntrance(entry);
  const still = animated && (!playing || reducedMotion);
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
        update(namePatch(tile));
        playFor(2000);
      }}
      onPreview={() => {
        preview(namePatch(tile));
        setPlaying(true);
      }}
      onPreviewEnd={() => {
        endPreview();
        setPlaying(false);
      }}
      artClassName="h-[89px]"
      art={
        <CreatorBackdrop background={config.background}>
          <span
            className="flex h-full w-full items-center justify-center px-2"
            style={cardFill(look)}
          >
            <span
              className={cn(
                "truncate text-[26px] font-bold leading-[33px]",
                effectClassName(entry, still)
              )}
              style={
                {
                  ...themeCssVars(look),
                  "--amped-font": values.fontColor,
                  "--amped-name-glow": `${values.fontColor}B3`,
                  fontFamily: values.fontFamily,
                  color: values.fontColor,
                } as CSSProperties
              }
            >
              <NameText
                entry={entry}
                text={profile.name || "Your name"}
                colors={colors}
                paused={still}
              />
            </span>
          </span>
        </CreatorBackdrop>
      }
    />
  );
}

export function NameRow() {
  const { config, values, locked, update, nameContrast, yourColors } = useDesign();
  const selectedIndex = nameIndex(values.heroEffect, config.heroEffectId);
  const tile = NAME_TILES[selectedIndex] ?? NAME_TILES[0]!;
  const { entry } = tile;
  const settle = nameSettle(entry, config.heroEffectLoop);
  const target = config.heroAppliesTo ?? "name";
  const entrance = isNameEntrance(entry);
  const guard = nameContrast(namePaintedColors(entry, values));
  return (
    <DisclosureRow
      id="name-effect"
      label="Name"
      value={nameRowValue(entry, config.heroEffectLoop)}
      warning={guard ? !guard.passes : false}
    >
      <div className="space-y-[21px]">
        <OptionGrid label="Name effect">
          {NAME_TILES.map((t, index) => (
            <NameTileView
              key={t.effectId ?? t.id}
              tile={t}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
            />
          ))}
        </OptionGrid>

        <ParamPanel
          entry={entry}
          stored={config.heroEffectParams}
          disabled={locked}
          yourColors={yourColors}
          onChange={params => update({ heroEffectParams: params })}
        />

        {entry.loop && (
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Settle</p>
            <ChipGroup
              label="Settle"
              value={settle}
              onChange={value => {
                if (!locked) update({ heroEffectLoop: value });
              }}
              options={NAME_SETTLES.map(value => ({
                value,
                label: SETTLE_LABELS[value],
                disabled: locked,
              }))}
            />
            <p className="text-prism-meta text-prism-ink-2">
              {settle === "once"
                ? "Plays when the page opens."
                : "Keeps playing. Visitors can pause it."}
            </p>
          </div>
        )}

        {entry.id !== "name.none" && (
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Applies to</p>
            <ChipGroup
              label="Applies to"
              value={entrance ? "name" : target}
              onChange={value => {
                if (!locked && !entrance) update({ heroAppliesTo: value });
              }}
              options={NAME_TARGETS.map(value => ({
                value,
                label: TARGET_LABELS[value],
                disabled: locked || entrance,
              }))}
            />
            {entrance && (
              <p className="text-prism-meta text-prism-ink-2">
                Letter effects play on the name only, once per visit.
              </p>
            )}
          </div>
        )}

        <p className="text-prism-meta text-prism-ink-2">
          Your visitors with reduced motion see a still version.
        </p>
        {guard && !guard.passes && (
          <ContrastNotice
            heading={`Your name is hard to read with ${entry.label}`}
            body={`Your name measures ${formatRatio(guard.ratio)} on the page card. Visitors need 3:1.`}
            actionLabel="Remove effect"
            onAction={() => update({ heroEffect: 0, heroEffectId: undefined })}
            disabled={locked}
          />
        )}
      </div>
    </DisclosureRow>
  );
}
