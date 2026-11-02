import {
  BORDER_STYLES,
  BORDER_STYLE_LABELS,
  CONTAINER_SHAPES,
  CONTAINER_SHAPE_LABELS,
  type BorderStyle,
  type ContainerShape,
} from "@repo/constants";
import { ChipGroup } from "@repo/ui";

// Theme Engine v2 phase 2, Container row (spec 3.5, board 03, Screen Review
// row 141): Shape and Border chips under the surface grid. Behind
// VITE_SHOW_THEME_V2. Shape and border are params on the surface, so they
// carry over when the creator picks another surface.

export function SurfaceControls({
  shape,
  border,
  disabled,
  noSurface,
  onChange,
}: {
  shape: ContainerShape;
  border: BorderStyle;
  disabled: boolean;
  /** No surface picked: nothing to shape, so the chips rest with a reason. */
  noSurface: boolean;
  onChange: (patch: { containerShape?: ContainerShape; containerBorder?: BorderStyle }) => void;
}) {
  const off = disabled || noSurface;
  return (
    <div className="space-y-[21px]">
      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Shape</p>
        <ChipGroup
          label="Container shape"
          value={shape}
          onChange={value => {
            if (!off) onChange({ containerShape: value });
          }}
          options={CONTAINER_SHAPES.map(value => ({
            value,
            label: CONTAINER_SHAPE_LABELS[value],
            disabled: off,
          }))}
        />
      </div>
      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Border</p>
        <ChipGroup
          label="Container border"
          value={border}
          onChange={value => {
            if (!off) onChange({ containerBorder: value });
          }}
          options={BORDER_STYLES.map(value => ({
            value,
            label: BORDER_STYLE_LABELS[value],
            disabled: off,
          }))}
        />
        {noSurface && (
          <p className="text-prism-meta text-prism-ink-2">
            Pick a surface to change its shape and border.
          </p>
        )}
      </div>
    </div>
  );
}
