import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ChipGroup, composite, contrastRatio, nearestPassingShade, parseHex } from "@repo/ui";
import { DisclosureRow, ValueSwatch } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { CardMiniature, CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { formatRatio, useDesign } from "../kit/useDesign";

// Screen Review 024. The Container row: style tiles, Container color, Opacity.

const CONTAINER_STYLES = [
  { id: 0, name: "None" },
  { id: 1, name: "Frosted glass" },
  { id: 2, name: "Floating card" },
  { id: 3, name: "Gradient border" },
  { id: 4, name: "Neon glow" },
  { id: 5, name: "Double border" },
  { id: 7, name: "Minimal glass" },
  { id: 9, name: "Modern card" },
];

const OPACITY_PRESETS = ["100", "75", "50", "25", "0"] as const;

export function ContainerRow() {
  const design = useDesign();
  const { values, config, locked, update, preview, endPreview, cardContrast, backgroundColors } =
    design;
  const look = { ...config, ...values };
  const selectedIndex = CONTAINER_STYLES.findIndex(s => s.id === values.containerStyle);
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

  const styleName = CONTAINER_STYLES.find(s => s.id === values.containerStyle)?.name ?? "None";

  return (
    <DisclosureRow
      id="container"
      label="Container"
      value={styleName}
      swatch={<ValueSwatch style={{ backgroundColor: values.containerColor }} />}
      warning={cardContrast ? !cardContrast.passes : false}
    >
      <div className="space-y-[21px]">
        <OptionGrid label="Container style">
          {CONTAINER_STYLES.map((style, index) => (
            <OptionTile
              key={style.id}
              label={style.name}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
              disabled={locked}
              onSelect={() => update({ containerStyle: style.id })}
              onPreview={() => preview({ containerStyle: style.id })}
              onPreviewEnd={endPreview}
              art={
                <CreatorBackdrop background={config.background}>
                  <CardMiniature config={look} containerStyle={style.id} />
                </CreatorBackdrop>
              }
            />
          ))}
        </OptionGrid>

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
