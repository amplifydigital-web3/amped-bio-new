import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getEffect } from "@repo/constants";
import { ParamStrip } from "./ParamStrip";

// Theme Engine v2 phase 2, Editor chrome: the parameter strip (spec 3.10).

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ParamStrip", () => {
  it("renders an overlay's Density, Speed and Colors, and hides the custom color", () => {
    render(
      <ParamStrip entry={getEffect("scene", "scene.snow")} stored={undefined} onChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Density")).toHaveProperty("value", "40");
    expect(screen.getByLabelText("Speed")).toHaveProperty("value", "40");
    expect(screen.getByRole("radiogroup", { name: "Colors" })).toBeTruthy();
    expect(screen.queryByText("Custom color")).toBeNull();
  });

  it("shows the custom color once Colors is Custom", () => {
    render(
      <ParamStrip
        entry={getEffect("scene", "scene.snow")}
        stored={{ palette: "custom", color: "#ff0000" }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Custom color")).toBeTruthy();
  });

  it("saves once, 233 ms after the last change, with the full clamped set", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <ParamStrip entry={getEffect("scene", "scene.snow")} stored={undefined} onChange={onChange} />
    );
    const density = screen.getByLabelText("Density");
    fireEvent.change(density, { target: { value: "60" } });
    fireEvent.change(density, { target: { value: "80" } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(233);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      density: 80,
      speed: 40,
      palette: "original",
      color: "#ffffff",
    });
  });

  it("gives Emoji rain a text field and the hover a Speed choice", () => {
    render(
      <ParamStrip
        entry={getEffect("scene", "scene.emoji-rain")}
        stored={undefined}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Emoji")).toBeTruthy();
    cleanup();
    render(
      <ParamStrip
        entry={getEffect("buttonHover", "buttonHover.scale")}
        stored={undefined}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("radiogroup", { name: "Speed" })).toBeTruthy();
  });
});
