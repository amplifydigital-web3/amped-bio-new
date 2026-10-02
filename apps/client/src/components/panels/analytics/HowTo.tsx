import { useId, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@repo/ui";

const STORAGE_PREFIX = "amped_howto_";

// The amped_howto_ keys are kept, so a creator's earlier choice survives (093 I41)
function readStored(key: string): "open" | "collapsed" | null {
  try {
    const value = window.localStorage.getItem(STORAGE_PREFIX + key);
    return value === "open" || value === "collapsed" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, open ? "open" : "collapsed");
  } catch {
    // The row still works, it just starts from its default next time
  }
}

/**
 * Screen Review 093 I41: a G0 disclosure row 55 with a numbered guide below.
 * Closed by default, open by default only when its section is empty. One
 * control toggles it and the choice is remembered.
 */
export function HowTo({
  storageKey,
  title,
  steps,
  footer,
  defaultOpen = false,
  className,
}: {
  storageKey: string;
  title: string;
  steps: readonly string[];
  footer?: React.ReactNode;
  // Open when nothing is set up yet (no campaigns, no pixel connected)
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(() => {
    const stored = readStored(storageKey);
    return stored === null ? defaultOpen : stored === "open";
  });
  const panelId = useId();

  const toggle = () => {
    setOpen(current => {
      writeStored(storageKey, !current);
      return !current;
    });
  };

  return (
    <div className={cn("border-y border-prism-line font-prism", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="prism-focus flex min-h-commit w-full items-center gap-[13px] rounded-prism-8 text-left"
      >
        <BookOpen aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">{title}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-[21px] w-[21px] shrink-0 text-prism-ink-2 transition-transform duration-prism-control motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="pb-[13px] pl-[34px]">
          <ol className="list-decimal space-y-1 pl-5 text-prism-body text-prism-ink-2">
            {steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {footer && <div className="mt-2 text-prism-meta text-prism-ink-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
