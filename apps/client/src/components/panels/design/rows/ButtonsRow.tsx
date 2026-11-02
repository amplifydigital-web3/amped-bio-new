import {
  BUTTON_BORDER_CLASSES,
  BUTTON_SHAPE_CLASSES,
  Button,
  cn,
  effectClassName,
  nearestPassingShade,
  parseHex,
  type Rgb,
} from "@repo/ui";
import { getEffect } from "@repo/constants";
import { DisclosureRow } from "../kit/DisclosureRow";
import { useDisclosureGroup } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { ButtonSpecimen, CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { formatRatio, useDesign, useSpecimenLabel } from "../kit/useDesign";
import { buttonRowValue, currentButtonShape } from "../kit/surfaceLook";
import { ButtonControls } from "./ButtonControls";

// Screen Review 025. The Buttons row: shape tiles and Button color.

// Theme Engine v2 (#28, phase 2): Hard shadow, Shape, Border, Layout (board 07)
const themeV2On = import.meta.env.VITE_SHOW_THEME_V2 === "true";

interface ButtonStyleTile {
  /** The v1 integer; for a v2 only style, the nearest v1 look. */
  id: number;
  name: string;
  /** A v2 only style, stored as buttonStyleId. */
  styleId?: string;
}

const V1_STYLES: ButtonStyleTile[] = [
  { id: 0, name: "Default" },
  { id: 1, name: "Soft" },
  { id: 2, name: "Outline" },
  { id: 3, name: "Shadow" },
  { id: 4, name: "Glass" },
  { id: 5, name: "Neon" },
  { id: 6, name: "Gradient" },
  { id: 7, name: "Floating" },
  { id: 8, name: "Bordered glow" },
  { id: 9, name: "Minimal" },
];

// Hard shadow has no v1 integer: v1 renderers draw Shadow (3) in its place
const HARD_SHADOW = getEffect("button", "button.hard-shadow");
const BUTTON_STYLES: ButtonStyleTile[] = themeV2On
  ? [...V1_STYLES, { id: 3, name: HARD_SHADOW.label, styleId: HARD_SHADOW.id }]
  : V1_STYLES;

/** The patch a tile writes: a v1 tile clears the v2 style id. */
function stylePatch(tile: ButtonStyleTile) {
  return { buttonStyle: tile.id, buttonStyleId: tile.styleId };
}

export function ButtonsRow() {
  const design = useDesign();
  const { values, config, locked, update, preview, endPreview, buttonContrast, cardColors } =
    design;
  const { setOpen } = useDisclosureGroup();
  const look = { ...config, ...values };
  const label = useSpecimenLabel();
  const storedId = themeV2On ? config.buttonStyleId : undefined;
  const selectedIndex = BUTTON_STYLES.findIndex(s =>
    storedId ? s.styleId === storedId : !s.styleId && s.id === values.buttonStyle
  );
  const styleName = BUTTON_STYLES[selectedIndex]?.name ?? "Default";
  const shape = currentButtonShape(values.buttonStyle, config.buttonShape);
  const border = config.buttonBorder ?? "none";
  // Tiles show the shape and border too, so a style reads as it will look
  const surfaceClass = themeV2On
    ? cn(BUTTON_SHAPE_CLASSES[shape], BUTTON_BORDER_CLASSES[border])
    : undefined;

  // I04 Fix contrast: move the button color to the nearest passing shade. For
  // see through shapes the text sits on the page, so move the text color.
  const fixContrast = () => {
    const font = parseHex(values.fontColor);
    if (!font) return;
    if (design.seeThroughButton) {
      const surface = cardColors?.[0] as Rgb | undefined;
      if (surface) update({ fontColor: nearestPassingShade(values.fontColor, surface, 4.5) });
      return;
    }
    update({ buttonColor: nearestPassingShade(values.buttonColor, font, 4.5) });
  };

  return (
    <DisclosureRow
      id="buttons"
      label="Buttons"
      value={themeV2On ? buttonRowValue(styleName, shape, border) : styleName}
      swatch={
        <span
          aria-hidden
          className="inline-block h-[21px] w-[34px] rounded-prism-8"
          style={{ backgroundColor: values.buttonColor }}
        />
      }
      warning={buttonContrast ? !buttonContrast.passes : false}
    >
      <div className="space-y-[21px]">
        <OptionGrid label={themeV2On ? "Button style" : "Button shape"}>
          {BUTTON_STYLES.map((style, index) => (
            <OptionTile
              key={style.styleId ?? style.id}
              label={style.name}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
              disabled={locked}
              onSelect={() => update(stylePatch(style))}
              onPreview={() => preview(stylePatch(style))}
              onPreviewEnd={endPreview}
              artClassName="h-[89px]"
              art={
                <CreatorBackdrop background={config.background}>
                  <ButtonSpecimen
                    config={look}
                    buttonStyle={style.id}
                    label={label}
                    className={cn(
                      style.styleId && effectClassName(getEffect("button", style.styleId)),
                      style.id === 1 && shape === "pill" ? undefined : surfaceClass
                    )}
                  />
                </CreatorBackdrop>
              }
            />
          ))}
        </OptionGrid>

        {themeV2On && (
          <ButtonControls
            shape={shape}
            border={border}
            layout={config.buttonLayout ?? "label"}
            disabled={locked}
            onChange={update}
          />
        )}

        <div className="space-y-2">
          <ColorControl
            label="Button color"
            value={values.buttonColor}
            disabled={locked}
            onChange={hex => update({ buttonColor: hex })}
            yourColors={design.yourColors}
          />
          {/* I05 */}
          <p className="text-prism-meta text-prism-ink-2">
            Button text uses your Text color.{" "}
            <Button
              variant="link"
              className="h-auto min-h-0 p-0 text-prism-meta"
              onClick={() => setOpen("text")}
            >
              Change text color
            </Button>
          </p>
        </div>

        {buttonContrast && !buttonContrast.passes && (
          <ContrastNotice
            heading="Button text is hard to read"
            body={`Text on your buttons measures ${formatRatio(buttonContrast.ratio)}. Visitors need 4.5:1.`}
            onAction={fixContrast}
            disabled={locked}
          />
        )}
      </div>
    </DisclosureRow>
  );
}
