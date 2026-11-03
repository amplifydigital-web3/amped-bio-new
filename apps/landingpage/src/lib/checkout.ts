import type { CheckoutSource } from "@repo/constants";
import { trpcClient } from "@/lib/trpc";

/**
 * Mobile checkout (docs/features/mobile-checkout.md 4, PR CK-2). Buy and Join on a public
 * page create a checkout intent and open the pay sheet on the app host. No wallet code
 * ships on amped.bio pages. A signed out fan lands on sign in there with the pay URL as
 * returnTo, so the intent survives sign up (CK-1).
 */

/** The pay sheet URL on the app host for an intent's pay path. */
export function payUrl(payPath: string): string {
  const base = process.env.NEXT_PUBLIC_PANEL_URL || "";
  return `${base}${payPath}`;
}

/** Starts an intent for a content item and navigates to the pay sheet. */
export async function startCheckout(input: {
  publicId: string;
  source: CheckoutSource;
  via?: string | null;
}): Promise<void> {
  const { payPath } = await trpcClient.checkout.start.mutate({
    kind: "purchase",
    target: { type: "content", id: input.publicId },
    source: input.source,
    ...(input.via ? { via: input.via } : {}),
  });
  window.location.assign(payUrl(payPath));
}
