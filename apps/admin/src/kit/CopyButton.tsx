import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@repo/ui";
import { toast } from "sonner";

// 44 copy button (087 I15, 089 parity, 094 D2). It confirms on the control
// itself: the icon turns into a check and the name reads Copied for 2 s.
export function CopyButton({
  value,
  label,
  className,
  size = "touch",
}: {
  value: string;
  // Accessible name, for example "Copy wallet address"
  label: string;
  className?: string;
  // "touch" is the 44 icon button; "inline" keeps the 44 target with no fill
  size?: "touch" | "inline";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(
        "prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 transition-colors duration-prism-hover ease-prism hover:bg-prism-nav-tint",
        size === "touch" && "prism-icon-btn",
        className
      )}
    >
      {copied ? (
        <Check aria-hidden className="h-[18px] w-[18px] text-prism-success" strokeWidth={2} />
      ) : (
        <Copy aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
      )}
    </button>
  );
}
