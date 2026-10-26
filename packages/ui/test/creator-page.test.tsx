import { renderToStaticMarkup } from "react-dom/server";
import { upgradeTheme, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { CREATOR_FOCUS, CreatorButton } from "../src/creator/creator-button";
import { cn } from "../src/utils";
import {
  containerBackground,
  effectClassName,
  hasLoopingMotion,
  lookCssVars,
  lookFor,
  overlayParticlesId,
  v1Values,
} from "../src/creator/look";
import { createFrameWatchdog } from "../src/motion/watchdog";
import { themeCssVars } from "../src/theme-style";
// The public page's live maps: with SHOW_THEME_V2 on, the public page must
// draw what it draws today
import * as publicStyles from "../../../apps/landingpage/src/lib/styles";

const IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const NEO: ThemeConfig = {
  buttonStyle: 5,
  containerStyle: 9,
  background: { type: "video", value: "https://example.com/Neo.mp4" },
  buttonColor: "#007523",
  containerColor: "#118901",
  fontFamily: "Roboto",
  fontSize: "16px",
  fontColor: "#ffffff",
  transparency: 45,
  buttonEffect: 8,
  particlesEffect: 0,
  heroEffect: 2,
};

const PROFILE = { name: "Maya Rivera", photo: "https://example.com/m.jpg", bio: "Designer" };

const page = (theme: ThemeConfig | ReturnType<typeof upgradeTheme>, extra = {}) =>
  renderToStaticMarkup(
    <CreatorPage theme={theme} mode="public" profile={PROFILE} blocks={<i>block</i>} {...extra} />
  );

describe("creator look (spec 3.4)", () => {
  it("resolves every v1 value to the public page's classes, playing and paused", () => {
    for (const n of IDS) {
      const look = lookFor({ containerStyle: n, buttonStyle: n, buttonEffect: n, heroEffect: n });
      expect(effectClassName(look.container)).toBe(publicStyles.getContainerStyle(n));
      expect(effectClassName(look.button)).toBe(publicStyles.getButtonBaseStyle(n));
      expect(effectClassName(look.buttonHover)).toBe(publicStyles.getButtonEffectStyle(n));
      expect(effectClassName(look.name)).toBe(publicStyles.getHeroEffectStyle(n));
      expect(effectClassName(look.name, true)).toBe(publicStyles.getHeroEffectStyle(n, true));
    }
  });

  it("plays the v1 particle preset and treats Matrix as retired, as the public page does", () => {
    for (const n of IDS) {
      const look = lookFor({ particlesEffect: n });
      expect(overlayParticlesId(look)).toBe(n === 6 ? 0 : n);
    }
  });

  it("offers Pause motion exactly when the public page does", () => {
    for (const particles of IDS) {
      for (const hero of IDS) {
        const expected =
          (particles !== 0 && particles !== 6) || publicStyles.LOOPING_HERO_EFFECTS.includes(hero);
        expect(hasLoopingMotion(lookFor({ particlesEffect: particles, heroEffect: hero }))).toBe(
          expected
        );
      }
    }
  });

  it("passes v1 values through untouched and writes v2 back into the v1 shape", () => {
    expect(lookFor(NEO).values).toBe(NEO);
    expect(v1Values(upgradeTheme(NEO))).toEqual({
      buttonColor: "#007523",
      containerColor: "#118901",
      fontColor: "#ffffff",
      fontFamily: "Roboto",
      fontSize: "16px",
      transparency: 45,
      background: { type: "video", value: "https://example.com/Neo.mp4" },
    });
    expect(
      v1Values(
        upgradeTheme({
          background: { type: "color", value: "linear-gradient(to right, #00c6ff, #0072ff)" },
        })
      ).background
    ).toEqual({ type: "color", value: "linear-gradient(90deg, #00c6ff 0%, #0072ff 100%)" });
  });

  it("writes the container color and the CSS variables as the public page does", () => {
    const look = lookFor(NEO);
    expect(containerBackground(look)).toBe("#11890173");
    expect(lookCssVars(look)).toEqual({ ...themeCssVars(NEO), "--amped-font": "#ffffff" });
  });

  it("caches the look per config object", () => {
    expect(lookFor(NEO)).toBe(lookFor(NEO));
  });
});

describe("CreatorPage public markup", () => {
  it("matches the public page's shell classes", () => {
    const html = page(NEO);
    expect(html).toContain('class="relative min-h-dvh"');
    expect(html).toContain('class="fixed inset-0 z-0"');
    expect(html).toContain(
      'class="relative z-[1] mx-auto w-full max-w-[610px] px-[21px] pt-[34px] sm:px-0 sm:pt-[55px]"'
    );
    expect(html).toContain(
      `class="w-full p-[21px] sm:p-[34px] ${publicStyles.getContainerStyle(9)}"`
    );
    expect(html).toContain(
      'class="h-[89px] w-[89px] rounded-full object-cover sm:h-[144px] sm:w-[144px]"'
    );
    expect(html).toContain(
      `class="line-clamp-3 break-words text-[26px] font-bold leading-[33px] tracking-normal mt-[21px] ${publicStyles.getHeroEffectStyle(2)}"`
    );
    expect(html).toContain('class="mt-[34px] flex flex-col gap-[13px]"');
    expect(html).toContain("background-color:#11890173");
    expect(html).toContain("background:#14141C"); // the video backdrop
  });

  it("renders a v2 config the same as the v1 config it came from", () => {
    // Background presets and posters aside, the v1 and v2 shapes draw one page
    expect(page(upgradeTheme(NEO))).toBe(page(NEO));
  });

  it("drops the surface padding and adds the photo shadow without a container", () => {
    const html = page({ ...NEO, containerStyle: 0 });
    expect(html).toContain('class="w-full"');
    expect(html).toContain("box-shadow:5px 13px 34px rgba(48,47,93,0.14)");
  });

  it("shows the settled name under Pause motion", () => {
    const html = page({ ...NEO, heroEffect: 8 }, { paused: true });
    expect(html).not.toContain("animate-rainbow");
    expect(page({ ...NEO, heroEffect: 8 })).toContain("motion-safe:animate-rainbow");
  });

  it("hands the overlay the preset and the pause state", () => {
    const html = page(
      { ...NEO, particlesEffect: 3 },
      {
        paused: true,
        renderOverlay: (effect: number, still: boolean) => <b>{`${effect}:${still}`}</b>,
      }
    );
    expect(html).toContain("<b>3:true</b>");
  });

  it("leaves out the block list when there are no blocks", () => {
    const html = renderToStaticMarkup(
      <CreatorPage theme={NEO} mode="public" profile={PROFILE} blocks={null} />
    );
    expect(html).not.toContain("mt-[34px] flex flex-col");
  });

  it("sanitizes an HTML bio", () => {
    const html = page(NEO, {
      profile: {
        ...PROFILE,
        bio: '<p>Hi <a href="https://x.com">x</a></p><script>alert(1)</script>',
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("[&amp;_a]:underline");
  });
});

describe("CreatorPage in the editor", () => {
  it("keeps the scene outside the scroller and uses the device sizes", () => {
    const phone = renderToStaticMarkup(
      <CreatorPage theme={NEO} mode="edit" size="phone" profile={PROFILE} />
    );
    expect(phone).toContain('class="relative flex h-full flex-col"');
    expect(phone).toContain('class="absolute inset-0 z-0"');
    expect(phone).toContain('class="relative z-[1] flex-1 overflow-auto"');
    expect(phone).toContain("px-[21px] pt-[34px]");
    expect(phone).not.toContain("sm:");
    const desktop = renderToStaticMarkup(
      <CreatorPage theme={NEO} mode="edit" size="desktop" profile={PROFILE} />
    );
    expect(desktop).toContain("px-0 pt-[55px]");
    expect(desktop).toContain("h-[144px] w-[144px]");
  });
});

describe("CreatorButton", () => {
  it("draws the public page's button from the registry", () => {
    const html = renderToStaticMarkup(
      <CreatorButton theme={NEO} label="Shop" href="https://example.com" />
    );
    // The class list the public page's button built before the move, merged by cn
    const before = cn(
      "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
      publicStyles.getButtonBaseStyle(5),
      publicStyles.getButtonEffectStyle(8),
      CREATOR_FOCUS
    );
    expect(html).toContain(`class="${before}"`);
    expect(html).toContain("background-color:#007523");
    expect(html).toContain("font-size:16px");
    expect(html).toContain('target="_blank"');
  });

  it("clamps the font size to 16 to 20", () => {
    expect(
      renderToStaticMarkup(<CreatorButton theme={{ fontSize: "24px" }} label="x" />)
    ).toContain("font-size:20px");
  });
});

describe("frame watchdog (spec 3.7)", () => {
  const run = (deltas: number[]) => {
    let slow = false;
    const dog = createFrameWatchdog({ onSlow: () => (slow = true) });
    let now = 1000; // requestAnimationFrame timestamps are never 0
    let kept = true;
    dog.sample(now);
    for (const d of deltas) {
      now += d;
      kept = dog.sample(now) && kept;
    }
    return { slow, kept };
  };

  it("keeps going when the median frame is under budget", () => {
    expect(run(Array(45).fill(16))).toEqual({ slow: false, kept: true });
  });

  it("stops once when the median of 45 frames is over 28 ms", () => {
    expect(run(Array(45).fill(40))).toEqual({ slow: true, kept: false });
  });

  it("ignores the gap while frames are paused", () => {
    let slow = false;
    const dog = createFrameWatchdog({ onSlow: () => (slow = true) });
    let now = 1000;
    for (let i = 0; i < 20; i++) dog.sample((now += 16));
    dog.pause();
    now += 10_000;
    for (let i = 0; i < 30; i++) dog.sample((now += 16));
    expect(slow).toBe(false);
  });
});
