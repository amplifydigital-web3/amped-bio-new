import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nameSettle, isNameEntrance, NAME_SETTLES, NAME_TARGETS } from "@repo/constants";
import {
  ChipGroup,
  NameText,
  ShowcaseProvider,
  WeightPulseName,
  cn,
  effectClassName,
  themeCssVars,
  usePrefersReducedMotion,
} from "@repo/ui";
import { isFeatureOn } from "../../../../config/featureFlags";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { cardFill, formatRatio, useDesign } from "../kit/useDesign";
import { ParamPanel } from "../kit/ParamStrip";
import { loadFontCatalog } from "./fonts/fontCatalog";
import type { FontCatalogEntry } from "@repo/constants";
import { currentNameFont } from "../kit/fontLook";
import {
  WEIGHT_PULSE_ID,
  canPulse,
  clampPulseParams,
  nameFontEntry,
  weightPulsePatch,
} from "../kit/weightPulse";
import {
  NAME_TILES,
  nameTilesFor,
  nameIndex,
  namePaintedColors,
  namePatch,
  nameRowValue,
  type NameTile,
} from "../kit/nameLook";

// Theme Engine v2 phase 2, Name row (board 08, spec 3.5). Behind
// VITE_SHOW_THEME_V2; the v1 row stays in MotionRows.tsx.

// TE-3f: Particle text (Showcase) joins the grid with the showcase flag
const themeShowcaseOn = isFeatureOn("themeShowcase");

/**
 * The Particle text tile draws the name in a still dot pattern: the live
 * effect is heavy, and heavy tiles never mount a live engine (decision 12).
 */
const DOTTED_NAME: CSSProperties = {
  backgroundImage: "radial-gradient(currentColor 0.9px, transparent 1.3px)",
  backgroundSize: "3px 3px",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const SETTLE_LABELS = { once: "Play once", always: "Loop" } as const;

// Phase 3c: Fuzzy text needs the canvas engine, so it shows with themeShowcase.
// TE-3e2: Weight pulse needs the font catalog.
const fontCatalogOn = isFeatureOn("themeV2") && isFeatureOn("fontCatalog");
const NAME_ROW_TILES = nameTilesFor(themeShowcaseOn).filter(
  t => fontCatalogOn || t.effectId !== WEIGHT_PULSE_ID
);

/** The catalog families, loaded only while fontCatalog is on (for Weight pulse). */
function usePulseFamilies(): readonly FontCatalogEntry[] | null {
  const [families, setFamilies] = useState<readonly FontCatalogEntry[] | null>(null);
  useEffect(() => {
    if (!fontCatalogOn) return;
    let cancelled = false;
    loadFontCatalog().then(
      catalog => !cancelled && setFamilies(catalog.families),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return families;
}
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
  families,
}: {
  tile: NameTile;
  selected: boolean;
  focusable: boolean;
  families: readonly FontCatalogEntry[] | null;
}) {
  const { config, values, profile, locked, update, preview, endPreview } = useDesign();
  const reducedMotion = usePrefersReducedMotion();
  const { playing, setPlaying, playFor } = usePlay();
  const look = { ...config, ...values };
  const { entry } = tile;
  // TE-3e2: Weight pulse fits its range to the name face, and needs a weight axis
  const pulse = tile.effectId === WEIGHT_PULSE_ID;
  const pulseEntry = pulse ? nameFontEntry(families, config, values.fontFamily) : undefined;
  const pulseReady = !pulse || canPulse(pulseEntry);
  const patch = () => (pulse ? weightPulsePatch(pulseEntry) : namePatch(tile));
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
      accessibleDescription={
        pulseReady ? entry.description : "Needs a name font with a weight axis. Pick one in Text."
      }
      tier={entry.tier}
      cost={entry.cost}
      selected={selected}
      focusable={focusable}
      disabled={locked || !pulseReady}
      onSelect={() => {
        const next = patch();
        if (!next) return;
        update(next);
        playFor(2000);
      }}
      onPreview={() => {
        const next = patch();
        if (next) preview(next);
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
                  ...(entry.render.kind === "particles" ? DOTTED_NAME : {}),
                } as CSSProperties
              }
            >
              {pulse ? (
                <span style={{ fontFamily: currentNameFont(config, values.fontFamily).family }}>
                  <WeightPulseName
                    text={profile.name || "Your name"}
                    params={weightPulsePatch(pulseEntry)?.heroEffectParams}
                    paused={!pulseReady}
                  />
                </span>
              ) : (
                <ShowcaseProvider
                  value={{ showcase: themeShowcaseOn, paused: still, device: "typical" }}
                >
                  <NameText
                    entry={entry}
                    text={profile.name || "Your name"}
                    colors={colors}
                    paused={still}
                    fontFamily={values.fontFamily}
                  />
                </ShowcaseProvider>
              )}
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
  // Roving focus lands on the selected tile when it is in the grid, else the first
  const focusTile =
    NAME_ROW_TILES.includes(tile) && (tile.entry.tier !== "showcase" || themeShowcaseOn)
      ? tile
      : NAME_ROW_TILES[0];
  const { entry } = tile;
  const settle = nameSettle(entry, config.heroEffectLoop);
  const target = config.heroAppliesTo ?? "name";
  // Weight pulse, like the entrances, plays on the name only
  const entrance = isNameEntrance(entry) || entry.id === WEIGHT_PULSE_ID;
  const families = usePulseFamilies();
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
          {NAME_ROW_TILES.map(t =>
            t.entry.tier === "showcase" && !themeShowcaseOn ? null : (
              <NameTileView
                key={t.effectId ?? t.id}
                tile={t}
                families={families}
                selected={t === tile}
                focusable={t === focusTile}
              />
            )
          )}
        </OptionGrid>

        <ParamPanel
          entry={entry}
          stored={config.heroEffectParams}
          disabled={locked}
          yourColors={yourColors}
          onChange={params =>
            update({
              heroEffectParams:
                entry.id === WEIGHT_PULSE_ID
                  ? clampPulseParams(nameFontEntry(families, config, values.fontFamily), params)
                  : params,
            })
          }
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
                {entry.id === WEIGHT_PULSE_ID
                  ? "Weight pulse plays on the name only."
                  : "Letter effects play on the name only, once per visit."}
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
