import { Info } from "lucide-react";
import { Tooltip } from "@repo/ui";

/**
 * Small info bubble next to a label. Opens on hover and on keyboard focus, and
 * the text is also exposed to screen readers through aria-label.
 */
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <Tooltip content={<span className="block max-w-[260px] leading-relaxed">{text}</span>}>
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        onClick={event => event.preventDefault()}
      >
        <Info className="w-3.5 h-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}
