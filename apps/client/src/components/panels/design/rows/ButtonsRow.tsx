import { Button, nearestPassingShade, parseHex, type Rgb } from "@repo/ui";
import { DisclosureRow } from "../kit/DisclosureRow";
import { useDisclosureGroup } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { ButtonSpecimen, CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { formatRatio, useDesign, useSpecimenLabel } from "../kit/useDesign";

// Screen Review 025. The Buttons row: shape tiles and Button color.

const BUTTON_STYLES = [
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

export function ButtonsRow() {
  const design = useDesign();
  const { values, config, locked, update, preview, endPreview, buttonContrast, cardColors } =
    design;
  const { setOpen } = useDisclosureGroup();
  const look = { ...config, ...values };
  const label = useSpecimenLabel();
  const selectedIndex = BUTTON_STYLES.findIndex(s => s.id === values.buttonStyle);

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
      value={BUTTON_STYLES.find(s => s.id === values.buttonStyle)?.name ?? "Default"}
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
        <OptionGrid label="Button shape">
          {BUTTON_STYLES.map((style, index) => (
            <OptionTile
              key={style.id}
              label={style.name}
              selected={index === selectedIndex}
              focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
              disabled={locked}
              onSelect={() => update({ buttonStyle: style.id })}
              onPreview={() => preview({ buttonStyle: style.id })}
              onPreviewEnd={endPreview}
              artClassName="h-[89px]"
              art={
                <CreatorBackdrop background={config.background}>
                  <ButtonSpecimen config={look} buttonStyle={style.id} label={label} />
                </CreatorBackdrop>
              }
            />
          ))}
        </OptionGrid>

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
