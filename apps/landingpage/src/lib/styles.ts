export function getButtonBaseStyle(style?: number): string {
  const styles = {
    0: "rounded-lg bg-gray-100",
    1: "rounded-full bg-gray-100",
    2: "rounded-lg border-2 border-gray-300",
    3: "rounded-lg bg-gray-100 shadow-lg",
    4: "rounded-lg bg-white/30 backdrop-blur-sm",
    5: "rounded-lg bg-gray-100 shadow-[0_0_15px_var(--amped-glow)] hover:shadow-[0_0_25px_var(--amped-glow)] transition-shadow",
    6: "rounded-lg bg-gradient-to-r from-[var(--amped-btn)] to-[var(--amped-btn-dark)]",
    7: "rounded-lg bg-gray-100 motion-safe:hover:-translate-y-1 transition-transform shadow-md",
    8: "rounded-lg bg-gray-100 ring-2 ring-offset-2 ring-[var(--amped-btn)]",
    9: "border-b-2 border-gray-300 hover:border-gray-400 transition-colors rounded-none bg-transparent",
  };
  return styles[style as keyof typeof styles] || styles[0];
}

export function getContainerStyle(style?: number): string {
  const styles = {
    0: "",
    1: "bg-white/70 backdrop-blur-md rounded-2xl shadow-lg",
    2: "bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] transition-shadow",
    3: "bg-gradient-to-r from-[var(--amped-btn)] to-[var(--amped-container)] rounded-2xl",
    4: "bg-white rounded-2xl shadow-[0_0_30px_var(--amped-glow)]",
    5: "bg-white rounded-2xl border-2 border-gray-200 outline outline-2 outline-offset-2 outline-gray-100",
    6: "bg-white/90 rounded-[2.5rem] shadow-[inset_0_0_30px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.1)]",
    7: "bg-white/50 backdrop-blur-sm rounded-xl border border-white/20",
    8: "relative before:absolute before:inset-x-0 before:top-0 before:-translate-y-[calc(100%-2rem)] before:h-24 before:bg-white/90 before:[border-radius:187.5px_187.5px_0_0] before:-z-10 bg-white/90 rounded-3xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.05)] backdrop-blur-sm",
    9: "bg-white rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.2)]",
  };
  return styles[style as keyof typeof styles] || "";
}

// Screen Review 041 I07: every button effect plays once per hover or keyboard
// focus over 233ms, moves only transform, opacity or shadow so neighbors never
// shift, and returns on leave. Reduced motion removes them (motion-safe).
const EFFECT_TIMING = "duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]";
export function getButtonEffectStyle(effect?: number): string {
  const effects = {
    0: "",
    1: `motion-safe:hover:scale-105 motion-safe:focus-visible:scale-105 transition-transform ${EFFECT_TIMING}`,
    2: `hover:shadow-[0_0_15px_var(--amped-glow)] focus-visible:shadow-[0_0_15px_var(--amped-glow)] transition-shadow ${EFFECT_TIMING}`,
    3: `motion-safe:hover:translate-x-2 motion-safe:focus-visible:translate-x-2 transition-transform ${EFFECT_TIMING}`,
    4: "motion-safe:hover:animate-[bounce_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[bounce_233ms_cubic-bezier(0.2,0,0,1)_1]",
    5: "motion-safe:hover:animate-[pulse_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[pulse_233ms_cubic-bezier(0.2,0,0,1)_1]",
    6: "motion-safe:hover:animate-[wiggle_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[wiggle_233ms_cubic-bezier(0.2,0,0,1)_1]",
    7: `motion-safe:hover:rotate-3 motion-safe:focus-visible:rotate-3 transition-transform ${EFFECT_TIMING}`,
    8: `motion-safe:hover:scale-110 motion-safe:focus-visible:scale-110 motion-safe:active:scale-95 transition-transform ${EFFECT_TIMING}`,
    9: `hover:before:opacity-100 focus-visible:before:opacity-100 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:opacity-0 before:transition-opacity overflow-hidden relative ${EFFECT_TIMING}`,
  };
  return effects[effect as keyof typeof effects] || "";
}

// Screen Review 041 I06: every name effect maps to a class that exists. Fade in
// and Slide up run once over 610ms; Typewriter renders as Fade in (its width
// clip cut long names). Glow keeps the creator's own text color.
// paused (Pause motion, 041 I02) and reduced motion render the settled name.
// Class strings stay literal so Tailwind can see them.
export function getHeroEffectStyle(effect?: number, paused = false): string {
  const effects: Record<number, string> = {
    0: "",
    1: "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500 motion-safe:animate-gradient",
    2: "drop-shadow-[0_0_10px_var(--amped-name-glow)]",
    3: "motion-safe:animate-[fadeIn_610ms_cubic-bezier(0.2,0,0,1)_both]",
    4: "motion-safe:animate-[fadeIn_610ms_cubic-bezier(0.2,0,0,1)_both]",
    5: "motion-safe:animate-[slideUp_610ms_cubic-bezier(0.2,0,0,1)_both]",
    6: "motion-safe:animate-wave",
    7: "text-[#ff00ff] drop-shadow-[0_0_10px_#ff00ff]",
    8: "motion-safe:animate-rainbow",
    9: "motion-safe:animate-glitch",
  };
  if (paused && LOOPING_HERO_EFFECTS.includes(effect ?? 0)) {
    // The settled look: Gradient keeps its colors without moving, the rest show the name
    return effect === 1
      ? "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500"
      : "";
  }
  return effects[effect ?? 0] || "";
}

/** Name effects that loop and so get the Pause motion control (041 I02). */
export const LOOPING_HERO_EFFECTS = [1, 6, 8, 9];

export function isHTML(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}
