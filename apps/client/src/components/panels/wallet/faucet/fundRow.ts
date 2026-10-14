import type { FaucetState } from "./useFaucet";

/**
 * Screen Review 051 I03, I09. The right meta of the Fund panel's Get testnet
 * tREVO row, read from the shared faucet status (useFaucet). null while the
 * status loads: the row shows a 13 x 55 skeleton bar instead.
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

/**
 * 051 I03: selecting Get testnet tREVO closes the Fund panel, scrolls the
 * Wallet to the faucet card and moves focus to its heading.
 */
export function focusFaucetHeading() {
  const card = document.getElementById("faucet");
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  const heading = card.querySelector<HTMLElement>("h3") ?? card;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
