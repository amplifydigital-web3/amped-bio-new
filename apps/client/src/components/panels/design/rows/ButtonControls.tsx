import {
  BORDER_STYLES,
  BORDER_STYLE_LABELS,
  BUTTON_LAYOUTS,
  BUTTON_LAYOUT_LABELS,
  BUTTON_SHAPES,
  BUTTON_SHAPE_LABELS,
  type BorderStyle,
  type ButtonLayout,
  type ButtonShape,
} from "@repo/constants";
import { ChipGroup } from "@repo/ui";

// Theme Engine v2 phase 2, Buttons row (spec 3.5, board 07, Screen Review
// row 145): Shape, Border and Layout chips. Behind VITE_SHOW_THEME_V2. They
// are params on the button, so they carry over when the creator picks
// another style.

export interface ButtonControlsPatch {
  buttonShape?: ButtonShape;
  buttonBorder?: BorderStyle;
  buttonLayout?: ButtonLayout;
}

export function ButtonControls({
  shape,
  border,
  layout,
  disabled,
  onChange,
}: {
  shape: ButtonShape;
  border: BorderStyle;
  layout: ButtonLayout;
  disabled: boolean;
  onChange: (patch: ButtonControlsPatch) => void;
}) {
  return (
    <div className="space-y-[21px]">
      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Shape</p>
        <ChipGroup
          label="Button shape"
          value={shape}
          onChange={value => {
            if (!disabled) onChange({ buttonShape: value });
          }}
          options={BUTTON_SHAPES.map(value => ({
            value,
            label: BUTTON_SHAPE_LABELS[value],
            disabled,
          }))}
        />
      </div>
      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Border</p>
        <ChipGroup
          label="Button border"
          value={border}
          onChange={value => {
            if (!disabled) onChange({ buttonBorder: value });
          }}
          options={BORDER_STYLES.map(value => ({
            value,
            label: BORDER_STYLE_LABELS[value],
            disabled,
          }))}
        />
      </div>
      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Layout</p>
        <ChipGroup
          label="Button layout"
          value={layout}
          onChange={value => {
            if (!disabled) onChange({ buttonLayout: value });
          }}
          options={BUTTON_LAYOUTS.map(value => ({
            value,
            label: BUTTON_LAYOUT_LABELS[value],
            disabled,
          }))}
        />
        {layout === "split" && (
          <p className="text-prism-meta text-prism-ink-2">Split adds a chevron at the right.</p>
        )}
      </div>
    </div>
  );
}
