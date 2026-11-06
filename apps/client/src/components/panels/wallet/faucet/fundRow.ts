import type { FaucetState } from "./useFaucet";

/**
 * Screen Review 051 I03, I09. A short status for the faucet, read from the
 * shared faucet status (useFaucet). null while the status loads. The Wallet
 * Get tREVO row uses it now that the faucet card lives on Home.
 */
export function faucetRowMeta(
  state: FaucetState,
  doneCount: number,
  nextAvailable: Date | null,
  now = Date.now()
): string | null {
  switch (state) {
    case "loading":
      return null;
    case "error":
      return "Status unavailable";
    case "paused":
      return "Paused";
    case "empty":
      return "Empty";
    case "setup":
      return `${doneCount} of 4 steps`;
    case "sending":
    case "sent":
    case "cooldown": {
      if (!nextAvailable) return "Requested";
      const left = Math.max(0, nextAvailable.getTime() - now);
      const hours = String(Math.floor(left / 3_600_000)).padStart(2, "0");
      const minutes = String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, "0");
      return `Next in ${hours}:${minutes}`;
    }
    case "ready":
      return "Ready";
  }
}

/** The Home path that opens the faucet card (Home reads ?open=faucet). */
export const HOME_FAUCET_PATH = "/home?open=faucet";

/**
 * Scrolls to the faucet card and moves focus to its heading. Returns false
 * when the card is not on the page (it lives on Home since the Get tREVO move).
 */
export function focusFaucetHeading(): boolean {
  const card = document.getElementById("faucet");
  if (!card) return false;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  const heading = card.querySelector<HTMLElement>("h3") ?? card;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  return true;
}
