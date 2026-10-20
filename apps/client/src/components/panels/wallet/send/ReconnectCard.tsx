import { useState } from "react";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";
import { Button } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { signInUrl } from "@/components/shell/ShellGate";

const RETRY_DELAYS_MS = [0, 1000, 3000];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Screen Review 063 D1: the shared fallback for the failed reconnect edge
 * case. Shown in place of an action that needs a signature while the live
 * wallet is not connected. Reading surfaces keep working from the saved
 * account address. Reconnect retries with backoff; when every try fails the
 * card offers Sign out.
 *
 * When the live wallet belongs to another account (an account switch in one
 * browser) reconnecting cannot help: the card says so and offers a full sign
 * out that ends the wallet session too, then the sign in page.
 */
export function ReconnectCard() {
  const wallet = useWalletContext();
  const [state, setState] = useState<"idle" | "reconnecting" | "failed">("idle");

  const signOutAndBack = async () => {
    await wallet.signOutEverywhere();
    window.location.href = signInUrl();
  };

  if (wallet.walletMismatch) {
    return (
      <div role="status" className="prism-glass-clear !rounded-prism-21 p-[21px] font-prism">
        <div className="flex items-start gap-3">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
          />
          <div className="min-w-0 flex-1">
            <p className="text-prism-label font-bold text-prism-ink">
              This wallet belongs to another account
            </p>
            <p className="mt-1 text-prism-body text-prism-ink-2">
              This browser is still signed in to the wallet of an account you used before. Sign out
              and sign back in to use this account&apos;s wallet. Nothing was sent.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          className="mt-[21px] w-full"
          onClick={() => void signOutAndBack()}
        >
          <LogOut aria-hidden />
          Sign out and sign back in
        </Button>
      </div>
    );
  }

  const reconnect = async () => {
    setState("reconnecting");
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await wait(delay);
      try {
        await wallet.connect();
        // The provider reports the live wallet; the card unmounts once it is back
        setState("idle");
        return;
      } catch {
        // try again after the next delay
      }
    }
    setState("failed");
  };

  return (
    <div role="status" className="prism-glass-clear !rounded-prism-21 p-[21px] font-prism">
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden
          className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
        />
        <div className="min-w-0 flex-1">
          <p className="text-prism-label font-bold text-prism-ink">Your wallet is not connected</p>
          <p className="mt-1 text-prism-body text-prism-ink-2">
            You can still see your balance and receive tREVO. Reconnect to stake, send, claim or
            launch a pool.
          </p>
          {state === "failed" && (
            <p className="mt-2 text-prism-meta font-semibold text-prism-danger">
              Could not reconnect.
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        className="mt-[21px] w-full"
        disabled={state === "reconnecting" || wallet.connecting}
        aria-busy={state === "reconnecting"}
        onClick={() => void reconnect()}
      >
        {state === "reconnecting" && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
        {state === "reconnecting"
          ? "Reconnecting"
          : state === "failed"
            ? "Try again"
            : "Reconnect wallet"}
      </Button>
      {state === "failed" && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => void signOutAndBack()}
        >
          Sign out
        </Button>
      )}
    </div>
  );
}
