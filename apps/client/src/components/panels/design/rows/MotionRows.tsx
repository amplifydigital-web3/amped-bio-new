import { useEffect, useRef, useState } from "react";
import { cn, usePrefersReducedMotion } from "@repo/ui";
import { getHeroEffectStyle } from "@/utils/styles";
import { ParticlesBackground } from "@/components/particles/ParticlesBackground";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ButtonSpecimen, CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { cardFill, formatRatio, useDesign, useSpecimenLabel } from "../kit/useDesign";
import { getEffect, legacyEffectId } from "@repo/constants";
import { ParamPanel } from "../kit/ParamStrip";
import {
  PRESS_IDS,
  currentPress,
  hoverIndex,
  hoverPatch,
  hoverTiles,
  pressPatch,
  type HoverTile,
  type PressId,
} from "../kit/motionLook";

// Screen Review 028, 029 and 030. The Motion rows.

const REDUCED_MOTION_LINE = "Your visitors with reduced motion see a still version.";

// Theme Engine v2 (#28, phase 2): five core hovers and the Button press row (board 09)
const themeV2On = import.meta.env.VITE_SHOW_THEME_V2 === "true";
const BUTTON_EFFECTS = hoverTiles(themeV2On);

// The hover effect as a playing state, for specimens (028 I02). Matches the
// renderer's hover classes in utils/styles.ts.
const PLAYING: Record<number, string> = {
  1: "motion-safe:scale-105 transition-transform",
  2: "shadow-[0_0_15px_var(--amped-glow)] transition-shadow",
  3: "motion-safe:translate-x-2 transition-transform",
  4: "motion-safe:animate-bounce",
  5: "motion-safe:animate-pulse",
  6: "motion-safe:animate-[wiggle_0.3s_ease-in-out_2]",
  7: "motion-safe:rotate-3 transition-transform",
  8: "motion-safe:scale-110 transition-transform",
  9: "brightness-110",
};

// The phase 2 hovers as a playing state, by id
const PLAYING_V2: Record<string, string> = {
  "buttonHover.fill-sweep":
    "relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 before:bg-[color-mix(in_srgb,currentColor_14%,transparent)]",
  "buttonHover.underline-grow":
    "relative before:absolute before:inset-x-3 before:bottom-[5px] before:h-[2px] before:bg-current",
  "buttonHover.border-draw":
    "ring-2 ring-inset ring-[color:color-mix(in_srgb,currentColor_60%,transparent)]",
  "buttonHover.icon-slide": "motion-safe:translate-x-1 transition-transform",
  "buttonHover.arrow-nudge": "motion-safe:translate-x-1 transition-transform",
};

// Press tiles as a playing state
const PRESS_PLAYING: Record<PressId, string> = {
  "buttonPress.none": "",
  "buttonPress.ripple":
    "relative overflow-hidden after:absolute after:left-1/2 after:top-1/2 after:h-[55px] after:w-[55px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-current after:opacity-25",
  "buttonPress.dip": "motion-safe:scale-[0.97] transition-transform",
};

const PARTICLE_EFFECTS = [
  { id: 0, name: "None", description: "No particles" },
  { id: 1, name: "Floating dots", description: "Gentle floating particles" },
  { id: 2, name: "Connecting lines", description: "Lines that follow the pointer" },
  { id: 3, name: "Snow", description: "Falling snow" },
  { id: 4, name: "Bubbles", description: "Rising bubbles" },
  { id: 5, name: "Fireflies", description: "Glowing fireflies" },
  { id: 7, name: "Confetti", description: "Colorful confetti" },
  { id: 8, name: "Stars", description: "Twinkling stars" },
  { id: 9, name: "Geometric", description: "Connected geometric shapes" },
];

const NAME_EFFECTS = [
  { id: 0, name: "None", description: "No effect on your name" },
  { id: 2, name: "Glow", description: "A soft glow in your text color" },
  { id: 6, name: "Wave", description: "Your name moves in a wave" },
  { id: 7, name: "Neon", description: "Neon light" },
  { id: 8, name: "Rainbow", description: "Cycles through rainbow colors" },
  { id: 9, name: "Glitch", description: "A glitch flicker" },
];

/** Animated name effects play only on hover, focus or tap in tiles (030 I02). */
const ANIMATED_NAME_EFFECTS = new Set([6, 8, 9]);

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

function ButtonHoverTile({
  effect,
  selected,
  focusable,
}: {
  effect: HoverTile;
  selected: boolean;
  focusable: boolean;
}) {
  const { config, values, locked, update, preview, endPreview } = useDesign();
  const label = useSpecimenLabel();
  const { playing, setPlaying, playFor } = usePlay();
  const look = { ...config, ...values };
  const entry = getEffect(
    "buttonHover",
    effect.effectId ?? legacyEffectId("buttonEffect", effect.id)
  );
  return (
    <OptionTile
      label={effect.name}
      tier={themeV2On ? entry.tier : undefined}
      cost={themeV2On ? entry.cost : undefined}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update(hoverPatch(effect));
        playFor(1200);
      }}
      onPreview={() => {
        preview(hoverPatch(effect));
        setPlaying(true);
      }}
      onPreviewEnd={() => {
        endPreview();
        setPlaying(false);
      }}
      artClassName="h-[89px]"
      art={
        <CreatorBackdrop background={config.background}>
          <ButtonSpecimen
            config={look}
            buttonStyle={values.buttonStyle}
            label={label}
            className={cn(
              "relative overflow-hidden",
              playing && (effect.effectId ? PLAYING_V2[effect.effectId] : PLAYING[effect.id])
            )}
          />
        </CreatorBackdrop>
      }
    />
  );
}

export function ButtonHoverRow() {
  const { values, config, locked, update } = useDesign();
  const storedId = themeV2On ? config.buttonEffectId : undefined;
  const selectedIndex = hoverIndex(BUTTON_EFFECTS, values.buttonEffect, storedId);
  const selectedTile = BUTTON_EFFECTS[selectedIndex];
  const selectedEntry =
    themeV2On && selectedTile
      ? getEffect(
          "buttonHover",
          selectedTile.effectId ?? legacyEffectId("buttonEffect", selectedTile.id)
        )
      : null;
  return (
    <DisclosureRow
      id="button-hover"
      label="Button hover"
      value={BUTTON_EFFECTS[selectedIndex]?.name ?? "None"}
    >
      <div className="space-y-3">
        <OptionGrid label="Button hover">
          {BUTTON_EFFECTS.map((effect, index) => (
            <ButtonHoverTile
              key={effect.effectId ?? effect.id}
              effect={effect}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
            />
          ))}
        </OptionGrid>
        {selectedEntry && (
          <ParamPanel
            entry={selectedEntry}
            stored={config.buttonEffectParams}
            disabled={locked}
            onChange={params => update({ buttonEffectParams: params })}
          />
        )}
        <p className="text-prism-meta text-prism-ink-2">
          {themeV2On
            ? "Hover needs a pointer. Phones feel the press effect below instead."
            : "Plays when a visitor hovers a link on a computer."}
        </p>
        <p className="text-prism-meta text-prism-ink-2">{REDUCED_MOTION_LINE}</p>
      </div>
    </DisclosureRow>
  );
}

function ButtonPressTile({
  id,
  selected,
  focusable,
}: {
  id: PressId;
  selected: boolean;
  focusable: boolean;
}) {
  const { config, values, locked, update, preview, endPreview } = useDesign();
  const label = useSpecimenLabel();
  const { playing, setPlaying, playFor } = usePlay();
  const look = { ...config, ...values };
  const entry = getEffect("buttonPress", id);
  return (
    <OptionTile
      label={entry.label}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update(pressPatch(id));
        playFor(610);
      }}
      onPreview={() => {
        preview(pressPatch(id));
        setPlaying(true);
      }}
      onPreviewEnd={() => {
        endPreview();
        setPlaying(false);
      }}
      artClassName="h-[89px]"
      art={
        <CreatorBackdrop background={config.background}>
          <ButtonSpecimen
            config={look}
            buttonStyle={values.buttonStyle}
            label={label}
            className={cn(playing && PRESS_PLAYING[id])}
          />
        </CreatorBackdrop>
      }
    />
  );
}

/** Theme Engine v2 phase 2: the Button press row (decision 6, board 09). */
export function ButtonPressRow() {
  const { config } = useDesign();
  if (!themeV2On) return null;
  const current = currentPress(config.buttonPressId);
  const selectedIndex = PRESS_IDS.indexOf(current);
  return (
    <DisclosureRow
      id="button-press"
      label="Button press"
      value={getEffect("buttonPress", current).label}
    >
      <div className="space-y-3">
        <OptionGrid label="Button press">
          {PRESS_IDS.map((id, index) => (
            <ButtonPressTile
              key={id}
              id={id}
              selected={index === selectedIndex}
              focusable={index === selectedIndex}
            />
          ))}
        </OptionGrid>
        <p className="text-prism-meta text-prism-ink-2">
          Plays when a visitor taps or clicks a link, on phones too.
        </p>
        <p className="text-prism-meta text-prism-ink-2">{REDUCED_MOTION_LINE}</p>
      </div>
    </DisclosureRow>
  );
}

function ParticlesTile({
  effect,
  selected,
  focusable,
  live,
  onLive,
}: {
  effect: (typeof PARTICLE_EFFECTS)[number];
  selected: boolean;
  focusable: boolean;
  live: boolean;
  onLive: (id: number | null) => void;
}) {
  const { config, locked, update, preview, endPreview } = useDesign();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <OptionTile
      label={effect.name}
      description={effect.description}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update({ particlesEffect: effect.id });
        // On tap the tile runs for 3 seconds (029 I02)
        onLive(effect.id);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onLive(null), 3000);
      }}
      onPreview={() => {
        preview({ particlesEffect: effect.id });
        onLive(effect.id);
      }}
      onPreviewEnd={() => {
        endPreview();
        onLive(null);
      }}
      art={
        <CreatorBackdrop background={config.background}>
          {effect.id !== 0 && (
            <ParticlesBackground
              id={`design-particles-${effect.id}`}
              effect={effect.id}
              mode={live ? "live" : "still"}
            />
          )}
        </CreatorBackdrop>
      }
    />
  );
}

export function ParticlesRow() {
  const { values } = useDesign();
  // One live instance at most (029 I02)
  const [live, setLive] = useState<number | null>(null);
  const selectedIndex = PARTICLE_EFFECTS.findIndex(e => e.id === values.particlesEffect);
  return (
    <DisclosureRow
      id="particles"
      label="Particles"
      value={PARTICLE_EFFECTS.find(e => e.id === values.particlesEffect)?.name ?? "None"}
    >
      <div className="space-y-3">
        <OptionGrid label="Particles">
          {PARTICLE_EFFECTS.map((effect, index) => (
            <ParticlesTile
              key={effect.id}
              effect={effect}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
              live={live === effect.id}
              onLive={setLive}
            />
          ))}
        </OptionGrid>
        <p className="text-prism-meta text-prism-ink-2">{REDUCED_MOTION_LINE}</p>
      </div>
    </DisclosureRow>
  );
}

function NameEffectTile({
  effect,
  selected,
  focusable,
}: {
  effect: (typeof NAME_EFFECTS)[number];
  selected: boolean;
  focusable: boolean;
}) {
  const { config, values, profile, locked, update, preview, endPreview } = useDesign();
  const reducedMotion = usePrefersReducedMotion();
  const { playing, setPlaying, playFor } = usePlay();
  const look = { ...config, ...values };
  const animated = ANIMATED_NAME_EFFECTS.has(effect.id);
  const showEffect = !animated || (playing && !reducedMotion);
  return (
    <OptionTile
      label={effect.name}
      accessibleDescription={effect.description}
      selected={selected}
      focusable={focusable}
      disabled={locked}
      onSelect={() => {
        update({ heroEffect: effect.id });
        playFor(2000);
      }}
      onPreview={() => {
        preview({ heroEffect: effect.id });
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
                showEffect && getHeroEffectStyle(effect.id)
              )}
              style={{
                fontFamily: values.fontFamily,
                color: effect.id === 8 && !showEffect ? "#FF0000" : values.fontColor,
                ["--amped-name-glow" as string]: `${values.fontColor}B3`,
              }}
            >
              {profile.name || "Your name"}
            </span>
          </span>
        </CreatorBackdrop>
      }
    />
  );
}

export function NameEffectRow() {
  const { values, locked, update, nameContrast } = useDesign();
  const selectedIndex = NAME_EFFECTS.findIndex(e => e.id === values.heroEffect);
  const selected = NAME_EFFECTS[selectedIndex];
  const guard = nameContrast(values.heroEffect);
  return (
    <DisclosureRow
      id="name-effect"
      label="Name effect"
      value={selected?.name ?? "None"}
      warning={guard ? !guard.passes : false}
    >
      <div className="space-y-3">
        <OptionGrid label="Name effect">
          {NAME_EFFECTS.map((effect, index) => (
            <NameEffectTile
              key={effect.id}
              effect={effect}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
            />
          ))}
        </OptionGrid>
        <p className="text-prism-meta text-prism-ink-2">{REDUCED_MOTION_LINE}</p>
        {guard && !guard.passes && (
          <ContrastNotice
            heading={`Your name is hard to read with ${selected?.name ?? "this effect"}`}
            body={`Your name measures ${formatRatio(guard.ratio)} on the page card. Visitors need 3:1.`}
            actionLabel="Remove effect"
            onAction={() => update({ heroEffect: 0 })}
            disabled={locked}
          />
        )}
      </div>
    </DisclosureRow>
  );
}
