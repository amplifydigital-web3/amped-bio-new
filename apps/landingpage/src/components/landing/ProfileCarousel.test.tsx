import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProfileCarousel } from "./ProfileCarousel";
import { CAROUSEL_SLIDES } from "./profileCarouselSlides";

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const activeImage = () => screen.getByRole("img");

describe("ProfileCarousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the first page and exposes only the active screen to assistive tech", () => {
    render(<ProfileCarousel />);
    expect(activeImage()).toHaveAttribute(
      "alt",
      `Example Amped.bio page: ${CAROUSEL_SLIDES[0].name}`
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("mounts only the current screen and the next one up front", () => {
    const { container } = render(<ProfileCarousel />);
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("advances on its own every 4 seconds", () => {
    render(<ProfileCarousel />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(activeImage()).toHaveAttribute(
      "alt",
      `Example Amped.bio page: ${CAROUSEL_SLIDES[1].name}`
    );
  });

  it("jumps to a page from its dot and marks it current", () => {
    render(<ProfileCarousel />);
    const target = CAROUSEL_SLIDES[5];
    fireEvent.click(screen.getByRole("button", { name: `Show ${target.name}` }));
    expect(activeImage()).toHaveAttribute("alt", `Example Amped.bio page: ${target.name}`);
    expect(screen.getByRole("button", { name: `Show ${target.name}` })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("stops rotating when paused", () => {
    render(<ProfileCarousel />);
    fireEvent.click(screen.getByRole("button", { name: "Pause example pages" }));
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(activeImage()).toHaveAttribute(
      "alt",
      `Example Amped.bio page: ${CAROUSEL_SLIDES[0].name}`
    );
  });

  it("does not rotate with reduced motion or the site Pause motion choice", () => {
    setReducedMotion(true);
    render(<ProfileCarousel />);
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(activeImage()).toHaveAttribute(
      "alt",
      `Example Amped.bio page: ${CAROUSEL_SLIDES[0].name}`
    );
  });

  it("respects the stored Pause motion choice", () => {
    localStorage.setItem("amped.motion.paused", "1");
    render(<ProfileCarousel />);
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(activeImage()).toHaveAttribute(
      "alt",
      `Example Amped.bio page: ${CAROUSEL_SLIDES[0].name}`
    );
  });
});
