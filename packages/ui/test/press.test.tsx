// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { PointerEvent } from "react";
import { getEffect } from "@repo/constants";
import { playPress } from "../src/creator/creator-button";

// Theme Engine v2 phase 2, Button press row: the ripple from the press point.

const COLORS = { button: "#111111", buttonText: "#ffffff", container: "#ffffff", text: "#222222" };

function pressOn(button: HTMLElement, x: number, y: number) {
  return { currentTarget: button, clientX: x, clientY: y } as unknown as PointerEvent<HTMLElement>;
}

describe("playPress", () => {
  it("plays one ripple from the press point and removes it when done", () => {
    const button = document.createElement("a");
    button.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 55 }) as DOMRect;
    const animation = { onfinish: null as null | (() => void), oncancel: null };
    const animate = vi.fn(() => animation);
    HTMLElement.prototype.animate = animate as never;
    window.matchMedia = vi.fn(() => ({ matches: false })) as never;

    playPress(getEffect("buttonPress", "buttonPress.ripple"), COLORS, pressOn(button, 60, 40));
    const dot = button.querySelector("span")!;
    expect(dot.style.left).toBe("50px");
    expect(dot.style.top).toBe("20px");
    expect(dot.style.width).toBe("500px");
    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: "#222222" })]),
      expect.objectContaining({ duration: 377 })
    );
    animation.onfinish!();
    expect(button.querySelector("span")).toBeNull();
  });

  it("plays nothing under reduced motion or for a class press", () => {
    const button = document.createElement("a");
    button.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 55 }) as DOMRect;
    HTMLElement.prototype.animate = vi.fn() as never;
    window.matchMedia = vi.fn(() => ({ matches: true })) as never;
    playPress(getEffect("buttonPress", "buttonPress.ripple"), COLORS, pressOn(button, 5, 5));
    window.matchMedia = vi.fn(() => ({ matches: false })) as never;
    playPress(getEffect("buttonPress", "buttonPress.dip"), COLORS, pressOn(button, 5, 5));
    expect(button.querySelector("span")).toBeNull();
  });
});
