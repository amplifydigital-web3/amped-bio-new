import { checkoutIntentFromPath } from "@repo/constants";

/**
 * Where Coinbase sends the fan after a Coinbase account purchase (spec 3.7 step 4). From a
 * checkout (mobile checkout 9) it is /r/{intent}: a page that needs no session and names
 * nothing about the purchase. Otherwise it is the Buy USDC panel on its session.
 */
export function coinbaseRedirectUrl(
  appUrl: string,
  sessionId: string,
  returnTo: string | null
): string {
  const intent = checkoutIntentFromPath(returnTo);
  if (intent) return new URL(`/r/${intent}`, appUrl).toString();
  const redirect = new URL("/wallet", appUrl);
  redirect.searchParams.set("fund", "usdc");
  redirect.searchParams.set("session", sessionId);
  return redirect.toString();
}
