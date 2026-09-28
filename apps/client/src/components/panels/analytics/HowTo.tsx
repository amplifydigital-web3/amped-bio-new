import { useState } from "react";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

const STORAGE_PREFIX = "amped_howto_";

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(STORAGE_PREFIX + key, "collapsed");
    else window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // The panel still works, it just opens again next time
  }
}

/**
 * Step-by-step help that sits at the top of a setup card. Open the first time,
 * remembers when the creator closes it, and can always be reopened.
 */
export function HowTo({
  storageKey,
  title,
  steps,
  footer,
}: {
  storageKey: string;
  title: string;
  steps: string[];
  footer?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(storageKey, next);
  };

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-blue-900"
      >
        <span className="inline-flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" aria-hidden />
          {title}
        </span>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5" />
        )}
      </button>
      {!collapsed && (
        <div className="px-3 pb-3">
          <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-700 leading-relaxed">
            {steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {footer && <div className="mt-2 text-xs text-gray-600">{footer}</div>}
          <button
            type="button"
            onClick={toggle}
            className="mt-2 text-xs font-medium text-blue-900 underline"
          >
            Got it, hide this
          </button>
        </div>
      )}
    </div>
  );
}
