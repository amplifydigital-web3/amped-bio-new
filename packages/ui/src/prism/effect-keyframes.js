// Theme effect keyframes (Theme Engine v2, phase 1b follow up; spec 3.4).
//
// Moved unchanged from the three copies in apps/client/src/styles/animations.css,
// apps/admin/src/styles/animations.css and apps/landingpage/src/styles/globals.css,
// and the matching animation shorthands from the three app tailwind configs.
// One copy now serves every app through the Prism preset, so the creator page
// effects cannot drift between the editor and the public page.
//
// The keyframes go in the base layer so they exist on every page, as they did
// in the stylesheets: some are referenced from inline styles, not only from
// animate-* classes. Values are byte for byte the old CSS.

const GLITCH_A = "0.05em 0 0 #00fffc, -0.03em -0.04em 0 #fc00ff, 0.025em 0.04em 0 #fffc00";
const GLITCH_B = "-0.05em -0.025em 0 #00fffc, 0.025em 0.035em 0 #fc00ff, -0.05em -0.05em 0 #fffc00";
const GLITCH_C = "0.05em 0.035em 0 #00fffc, 0.03em 0 0 #fc00ff, 0 -0.04em 0 #fffc00";
const GLITCH_D = "-0.05em 0 0 #00fffc, -0.025em -0.04em 0 #fc00ff, -0.04em -0.025em 0 #fffc00";

/** Global keyframes for the creator page effects and a few app animations. */
export const effectKeyframes = {
  "@keyframes gradient": {
    "0%": { backgroundPosition: "0% 50%" },
    "50%": { backgroundPosition: "100% 50%" },
    "100%": { backgroundPosition: "0% 50%" },
  },
  "@keyframes typewriter": {
    from: { width: "0" },
    to: { width: "100%" },
  },
  "@keyframes blink": {
    "50%": { borderColor: "transparent" },
  },
  "@keyframes fadeIn": {
    from: { opacity: "0", transform: "translateY(20px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  "@keyframes slideUp": {
    from: { opacity: "0", transform: "translateY(40px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  "@keyframes wave": {
    "0%, 100%": { transform: "translateY(0)" },
    "25%": { transform: "translateY(-8px)" },
    "75%": { transform: "translateY(8px)" },
  },
  "@keyframes rainbow": {
    "0%": { color: "#ff0000" },
    "17%": { color: "#ff8000" },
    "33%": { color: "#ffff00" },
    "50%": { color: "#00ff00" },
    "67%": { color: "#0000ff" },
    "84%": { color: "#8000ff" },
    "100%": { color: "#ff0000" },
  },
  // FloatingPills
  "@keyframes gentle-float": {
    "0%, 100%": { transform: "translateY(0px)" },
    "50%": { transform: "translateY(-8px)" },
  },
  "@keyframes subtle-fade": {
    "0%, 100%": { opacity: "0.6" },
    "50%": { opacity: "0.9" },
  },
  "@keyframes soft-glow": {
    "0%, 100%": { filter: "brightness(1)" },
    "50%": { filter: "brightness(1.2)" },
  },
  "@keyframes gentle-sway": {
    "0%, 100%": { transform: "translateX(0px)" },
    "25%": { transform: "translateX(-5px)" },
    "75%": { transform: "translateX(5px)" },
  },
  "@keyframes breath": {
    "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
    "50%": { transform: "scale(1.05)", opacity: "0.85" },
  },
  "@keyframes zoom-text": {
    "0%, 100%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.1)" },
  },
  // Random floating names, in smooth steps
  "@keyframes subtle-pulse": {
    "0%, 100%": { transform: "scale(1)", fontWeight: "400", opacity: "0.6" },
    "20%": { transform: "scale(1.02)", fontWeight: "420", opacity: "0.65" },
    "40%": { transform: "scale(1.04)", fontWeight: "440", opacity: "0.7" },
    "50%": { transform: "scale(1.05)", fontWeight: "450", opacity: "0.75" },
    "60%": { transform: "scale(1.04)", fontWeight: "440", opacity: "0.7" },
    "80%": { transform: "scale(1.02)", fontWeight: "420", opacity: "0.65" },
  },
  "@keyframes explore-ping": {
    "0%": { transform: "scale(1)", opacity: "1" },
    "25%": { transform: "scale(2)", opacity: "0" },
    "33%": { transform: "scale(2)", opacity: "0" },
    "66%": { transform: "scale(2)", opacity: "0" },
    "100%": { transform: "scale(1)", opacity: "0" },
  },
  ".animate-explore-ping": {
    animation: "explore-ping 3s linear infinite",
  },
  // Background row drift (Theme Engine v2 phase 2, spec 3.5). The sweep angle is a
  // registered property so it interpolates; without @property support the
  // gradient stays at its own angle.
  "@property --amped-sweep": {
    syntax: "'<angle>'",
    inherits: "false",
    initialValue: "0deg",
  },
  "@keyframes amped-sweep": {
    to: { "--amped-sweep": "360deg" },
  },
  "@keyframes amped-mesh-drift": {
    "0%, 100%": { backgroundPosition: "0% 0%" },
    "50%": { backgroundPosition: "100% 100%" },
  },
  "@keyframes glitch": {
    "0%": { textShadow: GLITCH_A },
    "15%": { textShadow: GLITCH_A },
    "16%": { textShadow: GLITCH_B },
    "49%": { textShadow: GLITCH_B },
    "50%": { textShadow: GLITCH_C },
    "99%": { textShadow: GLITCH_C },
    "100%": { textShadow: GLITCH_D },
  },
};

/** The animate-* utilities the effect maps use (theme.extend.animation). */
export const effectAnimations = {
  gradient: "gradient 3s linear infinite",
  glow: "glow 2s ease-in-out infinite alternate",
  typewriter: "typewriter 3s steps(40) 1s forwards",
  blink: "blink 0.5s step-end infinite",
  fadeIn: "fadeIn 1s ease-out forwards",
  slideUp: "slideUp 1s ease-out forwards",
  wave: "wave 1s ease-in-out infinite",
  rainbow: "rainbow 3s linear infinite",
  glitch: "glitch 3s infinite",
  // Background row drift: a linear gradient turns once in 21 s, a mesh drifts in 13 s
  "amped-sweep": "amped-sweep 21s linear infinite",
  "amped-mesh-drift": "amped-mesh-drift 13s ease-in-out infinite",
};
