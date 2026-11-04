import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GRADIENT_PRESETS, gradientCss, gradientPresetCss } from "@repo/constants";
import type { Background } from "@/types/editor";
import { GradientPicker } from "./GradientPicker";
import { gradientBackground, lookOf, mixColors, presetMatches } from "../kit/gradientLook";

// Theme Engine v2 phase 2, Background row (board 10, Screen Review row 148).

const northern = GRADIENT_PRESETS.find(p => p.id === "gradient.northern")!;
const northernBackground: Background = {
  type: "color",
  value: gradientPresetCss(northern),
  label: northern.label,
  id: northern.id,
  stops: northern.stops.map(s => ({ ...s })),
  angle: northern.angle,
};

function setup(current: Background = northernBackground) {
  const onApply = vi.fn();
  render(
    <GradientPicker
      current={current}
      disabled={false}
      yourColors={["#ffffff"]}
      onApply={onApply}
      onPreview={vi.fn()}
      onPreviewEnd={vi.fn()}
    />
  );
  return onApply;
}

describe("gradient helpers", () => {
  it("reads stops, a v1 gradient string, or nothing", () => {
    expect(lookOf(northernBackground)?.stops).toHaveLength(3);
    expect(
      lookOf({ type: "color", value: "linear-gradient(to right, #00c6ff, #0072ff)" })
    ).toMatchObject({ angle: 90, mesh: false });
    expect(lookOf({ type: "color", value: "#101820" })).toBeNull();
    expect(lookOf({ type: "image", value: "https://example.com/a.jpg" })).toBeNull();
  });

  it("matches a preset by id, or a v1 background by its exact string", () => {
    const blue = GRADIENT_PRESETS.find(p => p.id === "gradient.blue")!;
    expect(presetMatches(northern, northernBackground)).toBe(true);
    expect(
      presetMatches(blue, { type: "color", value: "linear-gradient(to right, #00c6ff, #0072ff)" })
    ).toBe(true);
    expect(presetMatches(blue, northernBackground)).toBe(false);
  });

  it("writes static CSS for v1 renderers and the stops for v2", () => {
    const look = { stops: [...northern.stops], angle: 200, mesh: false };
    expect(
      gradientBackground(look, { label: "Your gradient", drift: true, texture: "grain" })
    ).toEqual({
      type: "color",
      value: gradientCss(look),
      label: "Your gradient",
      stops: northern.stops,
      angle: 200,
      drift: true,
      texture: "grain",
    });
    expect(
      gradientBackground(look, { label: "Your gradient", texture: "none" })
    ).not.toHaveProperty("texture");
  });

  it("mixes two colors halfway", () => {
    expect(mixColors("#000000", "#ffffff")).toBe("#808080");
  });
});

describe("GradientPicker", () => {
  it("shows the first ten gradients, Your gradient and See all 40", () => {
    setup();
    expect(screen.getAllByRole("radio", { name: /./ }).length).toBeGreaterThanOrEqual(11);
    expect(screen.getByRole("radio", { name: "Northern" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Your gradient" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See all/ }));
    expect(screen.getByRole("radio", { name: "Honey" })).toBeInTheDocument();
  });

  it("applies a curated gradient with its id and CSS", () => {
    const onApply = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Dawn" }));
    const dawn = GRADIENT_PRESETS[0]!;
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: dawn.id, value: gradientPresetCss(dawn), label: "Dawn" })
    );
  });

  it("adds a stop between the selected stop and the next, up to four", () => {
    const onApply = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    const written = onApply.mock.lastCall![0] as Background;
    expect(written.label).toBe("Your gradient");
    expect(written.stops).toHaveLength(4);
    expect(written.stops![1]!.at).toBe(25);
  });

  it("turns Drift on and keeps the curated gradient", () => {
    const onApply = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Drift" }));
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: northern.id, drift: true })
    );
  });

  it("keeps the ends at the edges", () => {
    setup();
    expect(screen.getByLabelText("Stop 1 position")).toBeDisabled();
  });
});
