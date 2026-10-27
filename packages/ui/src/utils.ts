import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the Prism tokens from prism/tailwind-preset.js, so
// `text-prism-label` counts as a font size (not a color) and a caller's
// `h-12` correctly replaces a component's `h-touch`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "touch",
        "commit",
        "phi-3",
        "phi-5",
        "phi-8",
        "phi-13",
        "phi-21",
        "phi-34",
        "phi-55",
        "phi-89",
        "phi-144",
        "phi-233",
      ],
      radius: ["prism-5", "prism-8", "prism-13", "prism-21", "prism-27", "prism-30", "prism-34"],
      shadow: ["prism-e0", "prism-e1", "prism-e2", "prism-e3", "prism-e4", "prism-e5"],
      text: [
        "prism-display",
        "prism-amount",
        "prism-display-68",
        "prism-display-42",
        "prism-card-title",
        "prism-panel-title",
        "prism-body",
        "prism-label",
        "prism-meta",
        "prism-eyebrow",
        "prism-code-sm",
        "prism-code",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
