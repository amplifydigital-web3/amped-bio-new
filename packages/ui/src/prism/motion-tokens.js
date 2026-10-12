// Prism 2.2 section 14. Motion. The one source for every duration and the one
// easing. The Tailwind preset (CSS classes and custom properties) and
// motion.ts (script) both read these values. Do not change a value without a
// spec version bump. No bounce, overshoot or spring anywhere.

/** Section 14. Motion. */
export const prismMotion = {
  micro: "89ms",
  hover: "144ms",
  control: "233ms",
  panel: "377ms",
  room: "610ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

/** Stagger between siblings that enter together (rows, cards, headline lines). */
export const prismStagger = "55ms";
