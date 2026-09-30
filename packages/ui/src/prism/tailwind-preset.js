// Amped Prism 2.2 (Balanced, v1.0, locked 26 Sep 2026) as a Tailwind preset.
//
// Every value below comes from the locked spec. Section numbers in the
// comments point at docs/PRISM.md, which mirrors the spec. Do not change a
// value without a spec version bump.
//
// Usage in an app tailwind.config:
//   import prismPreset from "../../packages/ui/src/prism/tailwind-preset.js";
//   export default { presets: [prismPreset], ... };
//
// All tokens live under the `prism` namespace (bg-prism-env, shadow-prism-e3,
// rounded-prism-21, font-prism-display, duration-prism-control) so nothing
// here collides with the existing shadcn tokens. Adding the preset changes
// nothing on screen until a component uses a prism class.

/** Section 3. Color tokens. */
export const prismColors = {
  env: "#F4F3FA",
  surface: "#FFFFFF",
  ink: "#16152B",
  "ink-2": "#3A3858",
  "ink-3": "#524F73",
  line: "rgba(22, 21, 43, 0.10)",
  "line-strong": "rgba(22, 21, 43, 0.18)",

  // Create (cyan). create-light is light only, never text.
  "create-light": "#27AAE1",
  "create-ink": "#0B5A80",

  // Navigate (indigo).
  nav: "#5650A2",
  "nav-hover": "#46418A",
  "nav-pressed": "#302F5D",
  "nav-tint": "rgba(86, 80, 162, 0.12)",

  // Value (purple). value is never small text.
  value: "#884D9E",
  "value-ink": "#6E3A82",
  "value-deep": "#5B2F70",
  "value-deep-hover": "#4E2A5E",
  "value-panel-1": "#EFE7F8",
  "value-panel-2": "#E4D6F0",
  "value-panel-3": "#D6C2E9",

  // Utility. Never decorative.
  success: "#17693F",
  "warning-ink": "#7A4F00",
  "warning-bg": "#FBF1DC",
  "warning-line": "rgba(122, 79, 0, 0.28)",
  danger: "#B3261E",

  // Room light.
  "beam-cyan": "#27AAE1",
  "beam-indigo": "#5650A2",
  "beam-purple": "#884D9E",
  haze: "#FFB38A",
};

/** Section 12. Radius. */
export const prismRadius = {
  5: "5px",
  8: "8px",
  13: "13px",
  21: "21px",
  27: "27px",
  30: "30px",
  34: "34px",
};

/** Section 13. Elevation. Light upper left, shadows fall down right. */
export const prismElevation = {
  e0: "none",
  e1: "0 1px 2px rgba(22, 21, 43, 0.05)",
  e2: "5px 13px 34px rgba(48, 47, 93, 0.14)",
  e3: "8px 21px 44px rgba(48, 47, 93, 0.18)",
  e4: "13px 34px 68px rgba(48, 47, 93, 0.32)",
  e5: "21px 44px 110px rgba(60, 24, 80, 0.4)",
};

/** Section 14. Motion. */
export const prismMotion = {
  micro: "89ms",
  hover: "144ms",
  control: "233ms",
  panel: "377ms",
  room: "610ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

/** Section 11. Type scale as [size, lineHeight]. */
export const prismType = {
  display: ["110px", { lineHeight: "100px", letterSpacing: "0.01em" }],
  amount: ["110px", { lineHeight: "110px", letterSpacing: "0.01em" }],
  "display-68": ["68px", { lineHeight: "55px" }],
  "display-42": ["42px", { lineHeight: "34px" }],
  "card-title": ["26px", { lineHeight: "33px", fontWeight: "700" }],
  "panel-title": ["20px", { lineHeight: "23px", fontWeight: "700" }],
  body: ["16px", { lineHeight: "26px" }],
  label: ["16px", { lineHeight: "20px" }],
  meta: ["13px", { lineHeight: "16px" }],
  eyebrow: ["13px", { lineHeight: "16px", letterSpacing: "0.08em", fontWeight: "600" }],
};

/** Section 12. Spacing. Production snaps of the Fibonacci scale. */
export const prismSpacing = {
  "phi-3": "4px",
  "phi-5": "4px",
  "phi-8": "8px",
  "phi-13": "12px",
  "phi-21": "20px",
  "phi-34": "32px",
  "phi-55": "56px",
  "phi-89": "88px",
  "phi-144": "144px",
  "phi-233": "232px",
  // Targets. Minimum 44, primary actions 55.
  touch: "44px",
  commit: "55px",
};

const WHITE_TOP = "inset 0 1px 0 #FFFFFF";
const HAIRLINE = "0 0 0 1px rgba(22, 21, 43, 0.05)";

// Section 6. The spectral rim covers about 61.8% of the perimeter from upper left.
const RIM_GRADIENT =
  "conic-gradient(from 300deg at 50% 50%, rgba(39,170,225,0) 0deg, rgba(39,170,225,0.95) 20deg, rgba(86,80,162,0.95) 100deg, rgba(136,77,158,0.95) 180deg, rgba(136,77,158,0) 222deg, rgba(136,77,158,0) 360deg)";
const HALO_CARD_GRADIENT =
  "conic-gradient(from 300deg at 50% 50%, rgba(39,170,225,0) 0deg, rgba(39,170,225,0.85) 20deg, rgba(86,80,162,0.75) 100deg, rgba(136,77,158,0.8) 180deg, rgba(136,77,158,0) 222deg, rgba(136,77,158,0) 360deg)";
const HALO_PANEL_GRADIENT =
  "conic-gradient(from 300deg at 50% 50%, rgba(39,170,225,0) 0deg, rgba(39,170,225,0.8) 20deg, rgba(86,80,162,0.7) 100deg, rgba(136,77,158,0.8) 180deg, rgba(136,77,158,0) 222deg, rgba(136,77,158,0) 360deg)";

function backdrop(value) {
  return { backdropFilter: value, WebkitBackdropFilter: value };
}

/**
 * Sections 4 to 8. Material and control recipes as component classes.
 * Written as a plain Tailwind plugin function so packages/ui does not need
 * tailwindcss as a dependency.
 */
function prismComponents({ addComponents, addBase }) {
  addBase({
    ".prism-font": {
      fontFamily: '"Figtree", ui-sans-serif, system-ui, sans-serif',
      fontVariantNumeric: "tabular-nums",
    },
  });

  addComponents({
    // Section 4. G0 environment, base layer only. Beams are a component (PR 3).
    ".prism-room": {
      backgroundColor: prismColors.env,
      backgroundImage:
        "radial-gradient(890px 610px at 100% 100%, rgba(86,80,162,0.08), transparent 70%), radial-gradient(610px 377px at 550px 0, rgba(255,255,255,0.45), transparent 70%)",
    },

    // Section 5. G1 navigate glass: top bar tabs, wallet chip, dock capsules.
    ".prism-glass-nav": {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 60%), linear-gradient(rgba(86,80,162,0.14), rgba(86,80,162,0.14)), rgba(255,255,255,0.52)",
      ...backdrop("blur(21px) saturate(1.6)"),
      border: "1px solid rgba(255,255,255,0.85)",
      boxShadow: `${WHITE_TOP}, inset 0 -3px 8px rgba(86,80,162,0.08), ${HAIRLINE}, ${prismElevation.e2}`,
    },

    // Section 5. G1 clear glass: secondary cards.
    ".prism-glass-clear": {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0) 40%), rgba(255,255,255,0.54)",
      ...backdrop("blur(21px) saturate(1.6)"),
      border: "1px solid rgba(255,255,255,0.85)",
      borderRadius: prismRadius[21],
      boxShadow: `${WHITE_TOP}, inset 0 -8px 13px -8px rgba(48,47,93,0.10), ${HAIRLINE}, 0 1px 3px rgba(22,21,43,0.05), 0 4px 8px rgba(22,21,43,0.06), ${prismElevation.e3}`,
    },

    // Section 5. G0 flat row: no glass, hairline separator.
    ".prism-row": {
      borderBottom: `1px solid ${prismColors.line}`,
    },

    // Section 5. G2 input well.
    ".prism-well": {
      background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.74))",
      ...backdrop("blur(13px) saturate(1.4)"),
      borderRadius: prismRadius[13],
      minHeight: "44px",
      boxShadow:
        "inset 0 2px 4px rgba(22,21,43,0.07), inset 0 0 0 1px rgba(22,21,43,0.18), 0 1px 0 rgba(255,255,255,0.9)",
    },

    // Section 5. G3 prism lens: the one focused object per region.
    ".prism-lens": {
      position: "relative",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 34%), linear-gradient(rgba(86,80,162,0.10), rgba(86,80,162,0.10)), rgba(255,255,255,0.62)",
      ...backdrop("blur(21px) saturate(1.8)"),
      border: "1px solid rgba(255,255,255,0.6)",
      borderRadius: prismRadius[21],
      boxShadow:
        "inset 0 2px 0 #FFFFFF, inset 2px 0 0 rgba(255,255,255,0.75), inset 5px 5px 13px rgba(255,255,255,0.55), inset 0 -3px 0 rgba(86,80,162,0.16), inset -5px -8px 21px rgba(48,47,93,0.12), 0 0 0 4px rgba(86,80,162,0.14), 0 3px 8px rgba(22,21,43,0.08), 13px 34px 68px rgba(48,47,93,0.32)",
    },

    // Section 5. G3 value panel: the commitment region's focused object.
    ".prism-value-panel": {
      position: "relative",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0) 144px), linear-gradient(180deg, rgba(239,231,248,0.8) 0%, rgba(228,214,240,0.8) 55%, rgba(214,194,233,0.82) 100%)",
      ...backdrop("blur(34px) saturate(1.8)"),
      border: "1px solid rgba(255,255,255,0.7)",
      borderRadius: prismRadius[34],
      boxShadow:
        "inset 0 2px 0 #FFFFFF, inset 2px 0 0 rgba(255,255,255,0.6), inset 0 21px 34px -21px rgba(255,255,255,0.9), inset 0 -55px 89px -34px rgba(91,47,112,0.2), 0 0 0 1px rgba(60,24,80,0.08), 0 5px 13px rgba(60,24,80,0.12), -8px 0 34px rgba(60,24,80,0.08), 21px 44px 110px rgba(60,24,80,0.4)",
    },

    // Section 5 and 15. Commit state: calmer, denser, no rim, no halo.
    ".prism-value-panel-calm": {
      position: "relative",
      background:
        "linear-gradient(180deg, rgba(242,236,250,0.9) 0%, rgba(233,222,244,0.9) 55%, rgba(224,209,238,0.9) 100%)",
      ...backdrop("blur(34px) saturate(1.4)"),
      border: "1px solid rgba(110,58,130,0.22)",
      borderRadius: prismRadius[34],
      boxShadow:
        "inset 0 2px 0 #FFFFFF, inset 0 -55px 89px -34px rgba(91,47,112,0.16), 0 0 0 1px rgba(60,24,80,0.08), 21px 44px 110px rgba(60,24,80,0.36)",
    },

    // Section 5. G2 slab: tables inside the value panel.
    ".prism-slab": {
      background: "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.7))",
      borderRadius: prismRadius[21],
      boxShadow:
        "inset 0 1px 0 #FFFFFF, inset 0 0 0 1px rgba(22,21,43,0.08), 3px 8px 21px rgba(46,20,60,0.06)",
    },

    // Section 5. Solid compliance notice. Never glass.
    ".prism-notice": {
      backgroundColor: prismColors["warning-bg"],
      border: `1px solid ${prismColors["warning-line"]}`,
      borderRadius: prismRadius[13],
      padding: "13px 21px 13px 13px",
      color: prismColors.ink,
    },

    // Section 6. Spectral rim. Place as an empty span inside a
    // position:relative host that does not use overflow hidden.
    ".prism-rim": {
      position: "absolute",
      inset: "-1px",
      borderRadius: "inherit",
      padding: "3px",
      background: RIM_GRADIENT,
      pointerEvents: "none",
      WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
      WebkitMaskComposite: "xor",
      mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    },
    // Section 6. Halo behind a lens card (8px larger each side).
    ".prism-halo-card": {
      position: "absolute",
      inset: "-8px",
      borderRadius: "29px",
      background: HALO_CARD_GRADIENT,
      filter: "blur(16px)",
      pointerEvents: "none",
      zIndex: "-1",
    },
    // Section 6. Halo behind a value panel.
    ".prism-halo-panel": {
      position: "absolute",
      inset: "-8px",
      borderRadius: "42px",
      background: HALO_PANEL_GRADIENT,
      filter: "blur(21px)",
      pointerEvents: "none",
      zIndex: "-1",
    },

    // Section 7. Lens thumb: selected tab or chip.
    ".prism-lens-thumb": {
      background: "linear-gradient(180deg, #FFFFFF 0%, #F1F0F9 100%)",
      color: prismColors["nav-pressed"],
      fontWeight: "700",
      boxShadow:
        "inset 0 2px 1px #FFFFFF, inset 0 -3px 6px rgba(86,80,162,0.12), 0 0 0 1.5px #5650A2, 3px 10px 21px rgba(48,47,93,0.26), 0 2px 4px rgba(22,21,43,0.08)",
    },

    // Section 7. Focus ring for every control: create-ink core plus cyan halo.
    ".prism-focus": {
      "&:focus-visible": {
        outline: "none",
        boxShadow: "0 0 0 1.5px #0B5A80, 0 0 0 5.5px rgba(39,170,225,0.32)",
      },
    },

    // v1.1 (approved in Screen Review 003 D1 and the design notes): raised glass
    // for floating layers (dialogs, sheets, menus, toasts). The 0.84 white base
    // keeps content underneath from reading through.
    ".prism-raised": {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 40%), rgba(255,255,255,0.84)",
      ...backdrop("blur(21px) saturate(1.6)"),
      border: "1px solid rgba(255,255,255,0.85)",
      boxShadow: `${WHITE_TOP}, ${HAIRLINE}, 0 4px 8px rgba(22,21,43,0.06), ${prismElevation.e3}`,
      color: prismColors.ink,
    },
    // v1.1 scrim behind dialogs and sheets.
    ".prism-scrim": {
      backgroundColor: "rgba(22,21,43,0.18)",
    },
    // Status disc: 55 G1 clear circle behind a 34 icon (empty states, results).
    ".prism-disc": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "55px",
      height: "55px",
      borderRadius: "9999px",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0) 40%), rgba(255,255,255,0.54)",
      border: "1px solid rgba(255,255,255,0.85)",
      boxShadow: `${WHITE_TOP}, ${HAIRLINE}, ${prismElevation.e1}`,
    },

    // Section 8. Buttons.
    ".prism-btn-primary": {
      color: "#FFFFFF",
      background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 55%), #5650A2",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.1), 0 0 0 1px #46418A, 5px 13px 26px rgba(86,80,162,0.32)",
      "&:hover": { backgroundColor: "#46418A", backgroundImage: "none" },
      "&:active": { backgroundColor: "#302F5D", backgroundImage: "none" },
    },
    ".prism-btn-commit": {
      color: "#FFFFFF",
      backgroundColor: "#5B2F70",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px #4E2A5E, 5px 13px 26px rgba(46,20,60,0.24)",
      "&:hover": { backgroundColor: "#4E2A5E" },
    },
    ".prism-btn-secondary": {
      color: prismColors.ink,
      background: "linear-gradient(180deg, #FFFFFF 0%, #F6F5FB 100%)",
      boxShadow:
        "inset 0 1px 0 #FFFFFF, inset 0 0 0 1px rgba(22,21,43,0.18), 3px 6px 13px rgba(48,47,93,0.12)",
      "&:hover": {
        boxShadow:
          "inset 0 1px 0 #FFFFFF, inset 0 0 0 1px rgba(22,21,43,0.28), 3px 8px 16px rgba(48,47,93,0.16)",
      },
    },
    // Ghost shows its lens at rest (nav text on the bare room fails contrast).
    ".prism-btn-ghost": {
      color: prismColors.nav,
      backgroundColor: "rgba(255,255,255,0.72)",
      boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.08)",
      "&:hover": {
        background: "linear-gradient(180deg, #FFFFFF 0%, #F1F0F9 100%)",
        boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.14), 3px 6px 13px rgba(48,47,93,0.10)",
      },
    },
    ".prism-btn-destructive": {
      color: "#FFFFFF",
      backgroundColor: prismColors.danger,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px #8F1E18",
      "&:hover": { backgroundColor: "#8F1E18" },
    },
    // Disabled: 40% ink on white 0.5, dashed ring, no shadow.
    ".prism-btn-disabled": {
      "&:disabled, &[aria-disabled='true']": {
        color: "rgba(22,21,43,0.4)",
        background: "rgba(255,255,255,0.5)",
        backgroundImage: "none",
        boxShadow: "none",
        outline: "1px dashed rgba(22,21,43,0.28)",
        outlineOffset: "-1px",
        cursor: "not-allowed",
      },
    },
    ".prism-icon-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "44px",
      height: "44px",
      borderRadius: "9999px",
      color: prismColors.ink,
      background: "linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.7) 100%)",
      boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.10)",
    },

    // Section 7. Unselected chip. Selected chips add prism-lens-thumb.
    ".prism-chip": {
      color: prismColors["ink-2"],
      background: "linear-gradient(180deg, rgba(255,255,255,0.56), rgba(255,255,255,0.3))",
      ...backdrop("blur(13px) saturate(1.4)"),
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1px rgba(22,21,43,0.18)",
    },

    // Section 2 and 14. Reduce blur on mobile; respect reduced motion.
    "@media (max-width: 767px)": {
      ".prism-glass-nav, .prism-glass-clear, .prism-lens": {
        ...backdrop("blur(13px) saturate(1.4)"),
      },
      ".prism-value-panel, .prism-value-panel-calm": {
        ...backdrop("blur(21px) saturate(1.4)"),
      },
    },
    "@media (prefers-reduced-motion: reduce)": {
      ".prism-rim, .prism-halo-card, .prism-halo-panel": {
        transition: "none",
        animation: "none",
      },
    },
  });
}

/** @type {import("tailwindcss").Config} */
const prismPreset = {
  content: [],
  theme: {
    extend: {
      colors: { prism: prismColors },
      borderRadius: Object.fromEntries(
        Object.entries(prismRadius).map(([key, value]) => [`prism-${key}`, value])
      ),
      boxShadow: Object.fromEntries(
        Object.entries(prismElevation).map(([key, value]) => [`prism-${key}`, value])
      ),
      spacing: prismSpacing,
      fontFamily: {
        prism: ['"Figtree"', "ui-sans-serif", "system-ui", "sans-serif"],
        "prism-display": ['"Bebas Neue"', "Impact", "sans-serif"],
      },
      fontSize: Object.fromEntries(
        Object.entries(prismType).map(([key, value]) => [`prism-${key}`, value])
      ),
      transitionDuration: {
        "prism-micro": prismMotion.micro,
        "prism-hover": prismMotion.hover,
        "prism-control": prismMotion.control,
        "prism-panel": prismMotion.panel,
        "prism-room": prismMotion.room,
      },
      transitionTimingFunction: {
        prism: prismMotion.easing,
      },
      ringColor: {
        "prism-focus": prismColors["create-ink"],
      },
    },
  },
  plugins: [prismComponents],
};

export default prismPreset;
