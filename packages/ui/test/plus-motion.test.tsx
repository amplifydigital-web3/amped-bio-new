// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { findEffect } from "@repo/constants";
import { CreatorButton } from "../src/creator/creator-button";
import { CreatorPage } from "../src/creator/creator-page";
import { ShowcaseProvider } from "../src/creator/showcase-context";
import { NameText } from "../src/creator/name-effect";
import { CircularName } from "../src/creator/plus-names";
import { hoverHandlers, magnetTransform, playSelfPress } from "../src/creator/hover-motion";

// Theme Engine v2 phase 3e (spec 3.5, boards 08 and 09)

const COLORS = { button: "#5650a2", buttonText: "#ffffff", container: "#ffffff", text: "#16152b" };
const on = (node: React.ReactNode) => (
  <ShowcaseProvider value={{ showcase: true, paused: false }}>{node}</ShowcaseProvider>
);

afterEach(() => vi.restoreAllMocks());

describe("Plus hovers on CreatorButton", () => {
  const LIFT = { buttonEffect: 1, buttonEffectId: "buttonHover.lift-tilt" };

  it("draws Lift and tilt with the showcase flag", () => {
    const html = renderToStaticMarkup(on(<CreatorButton theme={LIFT} label="Shop" />));
    expect(html).toContain("rotateX(var(--amped-hover-tilt,8deg))");
    expect(html).toContain("--amped-hover-tilt:8deg");
  });

  it("falls back to the stored v1 look without the flag", () => {
    const html = renderToStaticMarkup(<CreatorButton theme={LIFT} label="Shop" />);
    expect(html).not.toContain("rotateX");
    expect(html).toContain("scale-[var(--amped-hover-scale,1.05)]");
    expect(html).not.toMatch(/style="[^"]*--amped-hover-/);
  });

  it("sets Strength variables only with the flag", () => {
    const theme = { buttonEffect: 1, buttonEffectParams: { strength: 100 } };
    expect(renderToStaticMarkup(on(<CreatorButton theme={theme} label="x" />))).toContain(
      "--amped-hover-scale:1.1"
    );
    expect(renderToStaticMarkup(<CreatorButton theme={theme} label="x" />)).not.toMatch(
      /style="[^"]*--amped-hover-scale/
    );
  });

  it("pool buttons render no Plus hover either", () => {
    const html = renderToStaticMarkup(
      on(<CreatorButton theme={LIFT} label="Pool" effects={false} />)
    );
    expect(html).not.toContain("rotateX");
    expect(html).not.toMatch(/style="[^"]*--amped-hover-/);
  });
});

describe("Magnet", () => {
  const box = { left: 0, top: 0, width: 200, height: 50 };

  it("leans up to 8 px and 2 deg toward the pointer at the default Strength", () => {
    expect(magnetTransform(box, 200, 50)).toBe("translate(8px, 8px) rotate(2deg)");
    expect(magnetTransform(box, 100, 25)).toBe("translate(0px, 0px) rotate(0deg)");
    expect(magnetTransform(box, 0, 25, { strength: 100 })).toBe(
      "translate(-16px, 0px) rotate(-4deg)"
    );
    expect(magnetTransform(box, 9999, 25)).toBe("translate(8px, 0px) rotate(2deg)");
  });

  it("follows the pointer and settles back in 377 ms", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const node = document.createElement("button");
    node.getBoundingClientRect = () => ({
      ...box,
      right: 200,
      bottom: 50,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const animate = vi.fn();
    node.animate = animate as never;
    const handlers = hoverHandlers(findEffect("buttonHover.magnet")!);
    handlers.onPointerMove!({
      currentTarget: node,
      clientX: 200,
      clientY: 25,
      pointerType: "mouse",
    } as never);
    frames.forEach(f => f(0));
    expect(node.style.transform).toBe("translate(8px, 0px) rotate(2deg)");
    handlers.onPointerLeave!({ currentTarget: node } as never);
    expect(node.style.transform).toBe("");
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 377 });
  });

  it("ignores touch", () => {
    const node = document.createElement("button");
    const handlers = hoverHandlers(findEffect("buttonHover.magnet")!);
    handlers.onPointerMove!({
      currentTarget: node,
      clientX: 1,
      clientY: 1,
      pointerType: "touch",
    } as never);
    expect(node.style.transform).toBe("");
  });
});

describe("Jelly and Jelly press", () => {
  it("Jelly plays once on enter and focus, never on touch", () => {
    const node = document.createElement("button");
    const animate = vi.fn();
    node.animate = animate as never;
    const handlers = hoverHandlers(findEffect("buttonHover.jelly")!);
    handlers.onPointerEnter!({ currentTarget: node, pointerType: "touch" } as never);
    expect(animate).not.toHaveBeenCalled();
    handlers.onPointerEnter!({ currentTarget: node, pointerType: "mouse" } as never);
    handlers.onFocus!({ currentTarget: node });
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("a class hover has no handlers", () => {
    expect(hoverHandlers(findEffect("buttonHover.scale")!)).toEqual({});
  });

  it("Jelly press animates the button itself; Ripple does not", () => {
    const node = document.createElement("button");
    const animate = vi.fn();
    node.animate = animate as never;
    expect(playSelfPress(findEffect("buttonPress.jelly-press")!, node)).toBe(true);
    expect(playSelfPress(findEffect("buttonPress.ripple")!, node)).toBe(false);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});

describe("Plus name effects", () => {
  it("Rotating words adds the second line and reads every word to screen readers", () => {
    const html = renderToStaticMarkup(
      on(
        <NameText
          entry={findEffect("name.rotating-words")!}
          text="Maya"
          colors={COLORS}
          params={{ words: "artist, producer" }}
        />
      )
    );
    expect(html).toContain("Maya");
    expect(html).toContain('<span class="sr-only">, artist, producer</span>');
    expect(html).toContain('data-effect="name.rotating-words"');
    expect(html).toContain(">artist<");
  });

  it("Rotating words shows the plain name without the flag or without words", () => {
    const entry = findEffect("name.rotating-words")!;
    expect(
      renderToStaticMarkup(
        <NameText entry={entry} text="Maya" colors={COLORS} params={{ words: "a, b" }} />
      )
    ).toBe("Maya");
    expect(renderToStaticMarkup(on(<NameText entry={entry} text="Maya" colors={COLORS} />))).toBe(
      "Maya"
    );
  });

  it("Depth parallax keeps one readable name and two hidden layers", () => {
    const html = renderToStaticMarkup(
      on(<NameText entry={findEffect("name.depth-parallax")!} text="Maya" colors={COLORS} />)
    );
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('data-effect="name.depth-parallax"');
  });

  it("Circular rings the photo with the flag, and the heading keeps the name", () => {
    const theme = { heroEffect: 0, heroEffectId: "name.circular" };
    const profile = { name: "Maya Rivera", photo: "https://example.com/p.jpg" };
    const html = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={profile} showcase />
    );
    expect(html).toContain('data-effect="name.circular"');
    expect(html).toContain("<textPath");
    expect(html).toMatch(/<h1[^>]*><span class="sr-only">Maya Rivera<\/span>/);
    const off = renderToStaticMarkup(<CreatorPage theme={theme} mode="public" profile={profile} />);
    expect(off).not.toContain("name.circular");
    const noPhoto = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={{ name: "Maya" }} showcase />
    );
    expect(noPhoto).not.toContain("<textPath");
  });

  it("Circular squeezes a long name to fit the circle", () => {
    expect(renderToStaticMarkup(<CircularName text="Maya" size={144} />)).not.toContain(
      "textLength"
    );
    expect(renderToStaticMarkup(<CircularName text={"M".repeat(60)} size={89} />)).toContain(
      "textLength"
    );
  });
});
