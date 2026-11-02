import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  GRADIENT_PRESETS,
  gradientCss,
  gradientPresetCss,
  type GradientStop,
} from "@repo/constants";
import { Button, ChipGroup, cn } from "@repo/ui";
import type { Background } from "@/types/editor";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { RangeField } from "../kit/RangeField";
import {
  TEXTURES,
  YOUR_GRADIENT,
  gradientBackground,
  lookOf,
  mixColors,
  presetLook,
  presetMatches,
  type GradientLookState as Look,
  type Texture,
} from "../kit/gradientLook";

// Theme Engine v2 phase 2, Background row (spec 3.5, board 10, Screen Review
// row 148): 40 curated gradients, Your gradient, and a builder with 2 to 4
// stops, an angle and Still or Drift. Behind VITE_SHOW_THEME_V2.
//
// A built gradient stays a v1 color background: `value` holds its static CSS
// (v1 renderers draw it as is) and the stops, angle and drift ride along for
// the v2 renderer.

const FIRST_TILES = 10;
const MAX_STOPS = 4;
const MIN_STOPS = 2;

export function GradientPicker({
  current,
  disabled,
  yourColors,
  onApply,
  onPreview,
  onPreviewEnd,
}: {
  current?: Background;
  disabled: boolean;
  yourColors: string[];
  onApply: (background: Background) => void;
  onPreview: (background: Background) => void;
  onPreviewEnd: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const drift = current?.type === "color" && current.drift === true;
  const texture: Texture = (current?.type === "color" && current.texture) || "none";

  // The builder edits the current gradient, or starts from Northern
  const fallback = presetLook(GRADIENT_PRESETS.find(p => p.id === "gradient.northern")!);
  const [look, setLook] = useState<Look>(() => lookOf(current) ?? fallback);
  const [selected, setSelected] = useState(0);
  const currentKey = `${current?.id ?? ""}|${current?.value ?? ""}`;
  useEffect(() => {
    const next = lookOf(current);
    if (next) {
      setLook(next);
      setSelected(index => Math.min(index, next.stops.length - 1));
    }
    // Resync when another control changes the background, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const presets = showAll ? GRADIENT_PRESETS : GRADIENT_PRESETS.slice(0, FIRST_TILES);
  const matched = GRADIENT_PRESETS.find(p => presetMatches(p, current));
  const yours = !matched && !!lookOf(current);
  const selectedIndex = presets.findIndex(p => p === matched);
  const focusIndex = yours ? presets.length : selectedIndex === -1 ? 0 : selectedIndex;

  const writeLook = (next: Look) => {
    setLook(next);
    onApply(gradientBackground(next, { label: YOUR_GRADIENT, drift, texture }));
  };

  const stop = look.stops[selected] ?? look.stops[0]!;
  const prev = look.stops[selected - 1];
  const next = look.stops[selected + 1];

  const setStop = (patch: Partial<GradientStop>) =>
    writeLook({
      ...look,
      stops: look.stops.map((s, index) => (index === selected ? { ...s, ...patch } : s)),
    });

  const addStop = () => {
    if (look.stops.length >= MAX_STOPS) return;
    // Between the selected stop and the next one, or before the last
    const at = next ? selected : selected - 1;
    const left = look.stops[at]!;
    const right = look.stops[at + 1]!;
    const added = {
      color: mixColors(left.color, right.color),
      at: Math.round((left.at + right.at) / 2),
    };
    const stops = [...look.stops.slice(0, at + 1), added, ...look.stops.slice(at + 1)];
    setSelected(at + 1);
    writeLook({ ...look, stops });
  };

  const removeStop = () => {
    if (look.stops.length <= MIN_STOPS) return;
    const stops = look.stops.filter((_, index) => index !== selected);
    // Keep the ends at 0 and 100 so the gradient fills the page
    stops[0] = { ...stops[0]!, at: 0 };
    stops[stops.length - 1] = { ...stops[stops.length - 1]!, at: 100 };
    setSelected(Math.max(0, selected - 1));
    writeLook({ ...look, stops });
  };

  const bar = useMemo(() => gradientCss({ stops: look.stops, angle: 90 }), [look.stops]);

  return (
    <div className="space-y-[21px]">
      <OptionGrid label="Gradient">
        {presets.map((preset, index) => {
          const background = gradientBackground(presetLook(preset), {
            label: preset.label,
            id: preset.id,
            css: gradientPresetCss(preset),
            drift,
            texture,
          });
          return (
            <OptionTile
              key={preset.id}
              label={preset.label}
              selected={preset === matched}
              focusable={index === focusIndex}
              disabled={disabled}
              onSelect={() => {
                setLook(presetLook(preset));
                onApply(background);
              }}
              onPreview={() => onPreview(background)}
              onPreviewEnd={onPreviewEnd}
              art={<CreatorBackdrop background={background} />}
            />
          );
        })}
        <OptionTile
          label={YOUR_GRADIENT}
          selected={yours}
          focusable={focusIndex === presets.length}
          disabled={disabled}
          onSelect={() => writeLook(look)}
          art={
            <CreatorBackdrop background={gradientBackground(look, { label: YOUR_GRADIENT })}>
              <span className="rounded-prism-8 bg-white/90 px-2 py-1 text-prism-meta text-prism-ink">
                Build below
              </span>
            </CreatorBackdrop>
          }
        />
      </OptionGrid>

      <Button variant="secondary" onClick={() => setShowAll(all => !all)}>
        {showAll ? (
          "Show fewer"
        ) : (
          <>
            See all <span className="tabular-nums">{GRADIENT_PRESETS.length}</span>
          </>
        )}
      </Button>

      {/* Board 10: Build your own */}
      <section
        aria-labelledby="gradient-builder"
        className="prism-glass-clear space-y-[21px] p-[13px]"
      >
        <div>
          <h4 id="gradient-builder" className="text-prism-label font-semibold text-prism-ink">
            Build your own
          </h4>
          <p className="text-prism-meta text-prism-ink-2">Up to 4 stops.</p>
        </div>

        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Stops</p>
          <div
            aria-hidden
            className="h-[21px] rounded-full shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
            style={{ background: bar }}
          />
          <div role="group" aria-label="Gradient stops" className="flex flex-wrap gap-2">
            {look.stops.map((s, index) => (
              <button
                key={index}
                type="button"
                disabled={disabled}
                aria-pressed={index === selected}
                aria-label={`Stop ${index + 1}, ${s.color.toUpperCase()}`}
                onClick={() => setSelected(index)}
                className={cn(
                  "prism-chip prism-focus inline-flex h-touch items-center gap-2 rounded-full pl-2 pr-3 text-prism-label tabular-nums disabled:cursor-not-allowed",
                  index === selected && "prism-lens-thumb"
                )}
              >
                <span
                  aria-hidden
                  className="h-[21px] w-[21px] rounded-full shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
                  style={{ backgroundColor: s.color }}
                />
                {s.color.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled || look.stops.length >= MAX_STOPS}
              onClick={addStop}
              className="prism-chip prism-focus inline-flex h-touch items-center gap-1 rounded-full px-3 text-prism-label disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus aria-hidden className="h-[21px] w-[21px]" />
              Add stop
            </button>
          </div>
        </div>

        <ColorControl
          label={`Stop ${selected + 1} color`}
          value={stop.color}
          disabled={disabled}
          yourColors={yourColors}
          onChange={hex => setStop({ color: hex.toLowerCase() })}
        />

        <RangeField
          label={`Stop ${selected + 1} position`}
          value={stop.at}
          min={prev ? prev.at : 0}
          max={next ? next.at : 100}
          valueText={`${stop.at} percent`}
          disabled={disabled || look.mesh || !prev || !next}
          hint={
            look.mesh
              ? "Mesh gradients place their colors in the corners."
              : !prev || !next
                ? "The first and last stops stay at the edges."
                : undefined
          }
          onChange={at => setStop({ at })}
        />

        <Button
          variant="ghost"
          disabled={disabled || look.stops.length <= MIN_STOPS}
          onClick={removeStop}
        >
          <Trash2 aria-hidden />
          Remove stop {selected + 1}
        </Button>

        <RangeField
          label="Angle"
          value={look.angle}
          min={0}
          max={360}
          valueText={`${look.angle} degrees`}
          disabled={disabled || look.mesh}
          onChange={angle => writeLook({ ...look, angle })}
        />

        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Motion</p>
          <ChipGroup
            label="Motion"
            value={drift ? "drift" : "still"}
            onChange={value => {
              if (disabled) return;
              onApply(
                gradientBackground(look, {
                  label: matched?.label ?? YOUR_GRADIENT,
                  id: matched?.id,
                  css: matched ? gradientPresetCss(matched) : undefined,
                  drift: value === "drift",
                  texture,
                })
              );
            }}
            options={[
              { value: "still", label: "Still" },
              { value: "drift", label: "Drift" },
            ]}
          />
          <p className="text-prism-meta text-prism-ink-2">
            Drift is a light effect. Pause motion and reduced motion keep it still.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Texture chips for a gradient or an image (board 10). */
export function TextureChips({
  value,
  disabled,
  onChange,
}: {
  value: Texture;
  disabled: boolean;
  onChange: (texture: Texture) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-prism-label font-semibold text-prism-ink">Texture</p>
      <ChipGroup
        label="Texture overlay"
        value={value}
        onChange={texture => {
          if (!disabled) onChange(texture);
        }}
        options={TEXTURES}
      />
    </div>
  );
}
