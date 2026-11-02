import { useState } from "react";
import { ShoppingBag, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, trpc } from "@repo/ui";
import { checkoutResumeLabel } from "@repo/constants";

/** Mobile checkout (Build Board #49). Off until VITE_CHECKOUT is "true". */
// eslint-disable-next-line react-refresh/only-export-components
export const CHECKOUT_ON = import.meta.env.VITE_CHECKOUT === "true";

const DISMISS_KEY = "amped:checkout-resume-dismissed";

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Mobile first review R1, PR CK-1: on any app load with an open checkout intent
 * for the signed in fan, one bar offers to finish it. Tap returns to the pay
 * page for that intent. Not now hides it for this visit; the intent stays
 * payable from its link until it expires.
 */
export function CheckoutResumeBar() {
  const { data: intent } = useQuery({
    ...trpc.checkout.resumable.queryOptions(),
    enabled: CHECKOUT_ON,
    staleTime: 60_000,
  });
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!CHECKOUT_ON || !intent || dismissed === intent.id) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, intent.id);
    } catch {
      // Storage can be blocked; the bar still hides for this render
    }
    setDismissed(intent.id);
  };

  return (
    <div
      role="status"
      data-testid="checkout-resume-bar"
      className="prism-glass-clear !rounded-prism-13 flex items-center gap-3 py-2 pl-[13px] pr-2 font-prism"
    >
      <ShoppingBag aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />
      <p className="min-w-0 flex-1 truncate text-[16px] leading-6 text-prism-ink">
        {checkoutResumeLabel(intent.title)}
      </p>
      <Button onClick={() => window.location.assign(intent.payPath)}>Finish</Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
      >
        <X aria-hidden className="h-[21px] w-[21px]" />
      </button>
    </div>
  );
}
