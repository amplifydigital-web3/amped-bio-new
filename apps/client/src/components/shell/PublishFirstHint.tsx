import type { ReactNode } from "react";
import { Tooltip } from "@repo/ui";
import { PUBLISH_FIRST } from "./pageVisibility";

/**
 * Wraps a disabled share action so the reason shows on hover and focus. The
 * wrapper is focusable because a disabled control receives neither.
 */
export function PublishFirstHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={PUBLISH_FIRST}>
      <span
        tabIndex={0}
        role="group"
        aria-label={`${label}. ${PUBLISH_FIRST}`}
        className="prism-focus inline-flex shrink-0 rounded-prism-13"
      >
        {children}
      </span>
    </Tooltip>
  );
}
