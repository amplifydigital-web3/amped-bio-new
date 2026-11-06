import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ChipGroup, composite, contrastRatio, nearestPassingShade, parseHex } from "@repo/ui";
import { DisclosureRow, ValueSwatch } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { CardMiniature, CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { formatRatio, useDesign } from "../kit/useDesign";
import { containerRowValue, currentShape } from "../kit/surfaceLook";
import { SurfaceControls } from "./SurfaceControls";
import { isFeatureOn } from "../../../../config/featureFlags";
import { getEffect } from "@repo/constants";
import { ContainerFx, cn, effectClassName } from "@repo/ui";
import { ParamPanel } from "../kit/ParamStrip";

// Screen Review 024. The Container row: style tiles, Container color, Opacity.

interface ContainerTile {
  /** The v1 integer; for a v2 only surface, the nearest v1 look. */
  id: number;
  name: string;
  /** A v2 only surface (phase 3d), stored as containerStyleId. */
  styleId?: string;
}

const V1_STYLES: ContainerTile[] = [
  { id: 0, name: "None" },
  { id: 1, name: "Frosted glass" },
  { id: 2, name: "Floating card" },
  { id: 3, name: "Gradient border" },
  { id: 4, name: "Neon glow" },
  { id: 5, name: "Double border" },
  { id: 7, name: "Minimal glass" },
  { id: 9, name: "Modern card" },
];

// Theme Engine v2 (#28, phase 2): Shape and Border under the surfaces (board 03)
const themeV2On = isFeatureOn("themeV2");

// Phase 3d premium surfaces (TE-3d, board 03), after the core eight. v1
// renderers draw the nearest v1 surface in their place.
const PREMIUM: ContainerTile[] = [
  { id: 1, name: "Liquid glass", styleId: "container.liquid-glass" },
  { id: 4, name: "Electric border", styleId: "container.electric-border" },
  { id: 3, name: "Star border", styleId: "container.star-border" },
  { id: 2, name: "Spotlight", styleId: "container.spotlight" },
];

const CONTAINER_STYLES: ContainerTile[] = themeV2On ? [...V1_STYLES, ...PREMIUM] : V1_STYLES;

/** The patch a tile writes: a v1 tile clears the v2 surface id and its params. */
function stylePatch(tile: ContainerTile) {
  return {
    containerStyle: tile.id,
    containerStyleId: tile.styleId,
    containerParams: undefined,
  };
}

const OPACITY_PRESETS = ["100", "75", "50", "25", "0"] as const;

export function ContainerRow() {
  const design = useDesign();
  const { values, config, locked, update, preview, endPreview, cardContrast, backgroundColors } =
    design;
  const look = { ...config, ...values };
  const storedId = themeV2On ? config.containerStyleId : undefined;
  const selectedIndex = CONTAINER_STYLES.findIndex(s =>
    storedId ? s.styleId === storedId : !s.styleId && s.id === values.containerStyle
  );
  const selected = CONTAINER_STYLES[selectedIndex];
  const premium = selected?.styleId ? getEffect("container", selected.styleId) : null;
  const [opacityDraft, setOpacityDraft] = useState(String(values.transparency));
  const [opacityError, setOpacityError] = useState(false);

  useEffect(() => setOpacityDraft(String(values.transparency)), [values.transparency]);

  const commitOpacity = (text: string) => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) {
      setOpacityError(true);
      return;
    }
    setOpacityError(false);
    update({ transparency: Math.round(n) });
  };

  // I06 Fix contrast: lowest passing opacity, else the nearest passing shade
  const fixContrast = () => {
    const font = parseHex(values.fontColor);
    const container = parseHex(values.containerColor);
    if (!font || !container) return;
    if (backgroundColors) {
      for (let opacity = values.transparency; opacity <= 100; opacity++) {
        const passes = backgroundColors.every(
          bg => contrastRatio(font, composite(container, opacity / 100, bg)) >= 4.5
        );
        if (passes) {
          update({ transparency: opacity });
          return;
        }
      }
    }
    update({
      transparency: 100,
      containerColor: nearestPassingShade(values.containerColor, font, 4.5),
    });
  };

  const styleName = selected?.name ?? "None";
  const hasSurface = values.containerStyle !== 0;
  const shape = currentShape(values.containerStyle, config.containerShape);
  const border = config.containerBorder ?? "none";

  return (
    <DisclosureRow
      id="container"
      label="Container"
      value={themeV2On ? containerRowValue(styleName, shape, border, hasSurface) : styleName}
      swatch={<ValueSwatch style={{ backgroundColor: values.containerColor }} />}
      warning={cardContrast ? !cardContrast.passes : false}
    >
      <div className="space-y-[21px]">
        <OptionGrid label="Container style">
          {CONTAINER_STYLES.map((style, index) => {
            const entry = style.styleId ? getEffect("container", style.styleId) : null;
            return (
              <OptionTile
                key={style.styleId ?? style.id}
                label={style.name}
                tier={entry?.tier}
                cost={entry?.cost}
                selected={index === selectedIndex}
                focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
                disabled={locked}
                onSelect={() => update(stylePatch(style))}
                onPreview={() => preview(stylePatch(style))}
                onPreviewEnd={endPreview}
                art={
                  <CreatorBackdrop background={config.background}>
                    {entry ? (
                      <CardMiniature
                        config={look}
                        containerStyle={0}
                        className={cn(effectClassName(entry), "!rounded-prism-8")}
                      >
                        <ContainerFx
                          entry={entry}
                          colors={{
                            button: values.buttonColor,
                            buttonText: values.fontColor,
                            container: values.containerColor,
                            text: values.fontColor,
                          }}
                          paused
                        />
                      </CardMiniature>
                    ) : (
                      <CardMiniature config={look} containerStyle={style.id} />
                    )}
                  </CreatorBackdrop>
                }
              />
            );
          })}
        </OptionGrid>

        {premium && (
          <ParamPanel
            entry={premium}
            stored={config.containerParams}
            disabled={locked}
            yourColors={design.yourColors}
            onChange={params => update({ containerParams: params })}
          />
        )}

        {themeV2On && (
          <SurfaceControls
            shape={shape}
            border={border}
            disabled={locked}
            noSurface={!hasSurface}
            onChange={update}
          />
        )}

        <ColorControl
          label="Container color"
          value={values.containerColor}
          disabled={locked}
          onChange={hex => update({ containerColor: hex })}
          yourColors={design.yourColors}
        />

        {/* I04: Opacity, 100 is solid */}
        <div className="space-y-2">
          <p id="opacity-label" className="text-prism-label font-semibold text-prism-ink">
            Opacity
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup
              label="Opacity presets"
              value={
                (OPACITY_PRESETS as readonly string[]).includes(String(values.transparency))
                  ? (String(values.transparency) as (typeof OPACITY_PRESETS)[number])
                  : ("" as (typeof OPACITY_PRESETS)[number])
              }
              onChange={value => update({ transparency: Number(value) })}
              options={OPACITY_PRESETS.map(p => ({ value: p, label: `${p}%`, disabled: locked }))}
            />
            <div className="prism-well flex h-touch w-[89px] items-center px-3">
              <input
                aria-labelledby="opacity-label"
                inputMode="numeric"
                disabled={locked}
                value={opacityDraft}
                aria-invalid={opacityError || undefined}
                aria-describedby={opacityError ? "opacity-error" : undefined}
                onChange={event => setOpacityDraft(event.target.value.replace(/[^0-9]/g, ""))}
                onBlur={event => commitOpacity(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
                    const next = Math.min(100, Math.max(0, values.transparency + step));
                    update({ transparency: next });
                  } else if (event.key === "Enter") {
                    commitOpacity((event.target as HTMLInputElement).value);
                  }
                }}
                className="w-full min-w-0 bg-transparent text-prism-label tabular-nums text-prism-ink outline-none"
              />
              <span aria-hidden className="text-prism-label text-prism-ink-2">
                %
              </span>
            </div>
          </div>
          {opacityError && (
            <p
              id="opacity-error"
              className="flex items-center gap-1.5 text-prism-meta text-prism-danger"
            >
              <AlertCircle aria-hidden className="h-[21px] w-[21px]" />
              Enter a number from 0 to 100
            </p>
          )}
        </div>

        {cardContrast && !cardContrast.passes && (
          <ContrastNotice
            heading="Text on your page card is hard to read"
            body={`Your text measures ${formatRatio(cardContrast.ratio)} on the card. Visitors need 4.5:1.`}
            onAction={fixContrast}
            disabled={locked}
          />
        )}
      </div>
    </DisclosureRow>
  );
}
