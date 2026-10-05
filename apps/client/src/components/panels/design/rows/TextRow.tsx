import { ChipGroup, nearestPassingShade, parseHex, type Rgb } from "@repo/ui";
import { DisclosureRow } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { ContrastNotice } from "../kit/Notices";
import { cardFill, formatRatio, useDesign } from "../kit/useDesign";

// Screen Review 026. The Text row: Font, Text size, Text color.

// I03: eight faces, loaded from Google Fonts in index.html and the public page
const FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Lora",
  "Space Grotesk",
];

const SIZES = [
  { value: "14px", label: "Small" },
  { value: "16px", label: "Base" },
  { value: "18px", label: "Medium" },
  { value: "20px", label: "Large" },
  { value: "24px", label: "Extra large" },
] as const;

type Size = (typeof SIZES)[number]["value"];

export function TextRow() {
  const design = useDesign();
  const { values, config, profile, locked, update, preview, endPreview } = design;
  const { cardContrast, buttonContrast, cardColors, seeThroughButton } = design;
  const look = { ...config, ...values };
  const name = profile.name || "Your name";
  const selectedIndex = FONTS.indexOf(values.fontFamily);

  // I05: Fix contrast adjusts the text color's lightness against the failing surface
  const fixAgainst = (surface: Rgb | null | undefined) => {
    if (surface) update({ fontColor: nearestPassingShade(values.fontColor, surface, 4.5) });
  };

  return (
    <DisclosureRow
      id="text"
      label="Text"
      value={<span style={{ fontFamily: values.fontFamily }}>{values.fontFamily}</span>}
      warning={
        (cardContrast ? !cardContrast.passes : false) ||
        (buttonContrast ? !buttonContrast.passes : false)
      }
    >
      <div className="space-y-[21px]">
        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Font</p>
          <OptionGrid label="Font" columns="four">
            {FONTS.map((font, index) => (
              <OptionTile
                key={font}
                label={font}
                selected={index === selectedIndex}
                focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
                disabled={locked}
                onSelect={() => update({ fontFamily: font })}
                onPreview={() => preview({ fontFamily: font })}
                onPreviewEnd={endPreview}
                artClassName="h-[89px]"
                art={
                  <CreatorBackdrop background={config.background}>
                    <span
                      className="flex h-full w-full items-center justify-center truncate px-2 text-[26px] leading-[33px]"
                      style={{ ...cardFill(look), fontFamily: font, color: values.fontColor }}
                    >
                      {name}
                    </span>
                  </CreatorBackdrop>
                }
              />
            ))}
          </OptionGrid>
        </div>

        <div className="space-y-2">
          <p className="text-prism-label font-semibold text-prism-ink">Text size</p>
          <ChipGroup
            label="Text size"
            value={values.fontSize as Size}
            onChange={size => update({ fontSize: size })}
            options={SIZES.map(size => ({
              value: size.value,
              label: <span aria-description={size.value}>{size.label}</span>,
              disabled: locked,
            }))}
          />
          <p className="text-prism-meta text-prism-ink-2">
            Applies to link buttons and text blocks.
          </p>
        </div>

        <ColorControl
          label="Text color"
          value={values.fontColor}
          disabled={locked}
          onChange={hex => update({ fontColor: hex })}
          yourColors={design.yourColors}
        />

        {cardContrast && !cardContrast.passes && (
          <ContrastNotice
            heading="Text on your page card is hard to read"
            body={`Your text on the page card measures ${formatRatio(cardContrast.ratio)}. Visitors need 4.5:1.`}
            onAction={() => fixAgainst(cardColors?.[0])}
            disabled={locked}
          />
        )}
        {buttonContrast && !buttonContrast.passes && (
          <ContrastNotice
            heading="Button text is hard to read"
            body={`Your text on your buttons measures ${formatRatio(buttonContrast.ratio)}. Visitors need 4.5:1.`}
            onAction={() =>
              fixAgainst(seeThroughButton ? cardColors?.[0] : parseHex(values.buttonColor))
            }
            disabled={locked}
          />
        )}
      </div>
    </DisclosureRow>
  );
}
