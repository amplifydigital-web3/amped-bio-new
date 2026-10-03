import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button, useAuth } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";

const RETRY_DELAYS_MS = [0, 1000, 3000];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Screen Review 063 D1: the shared fallback for the failed reconnect edge
 * case. Shown in place of an action that needs a signature while the live
 * wallet is not connected. Reading surfaces keep working from the saved
 * account address. Reconnect retries with backoff; when every try fails the
 * card offers Sign out.
 */
export function ReconnectCard() {
  const wallet = useWalletContext();
  const { signOut } = useAuth();
  const [state, setState] = useState<"idle" | "reconnecting" | "failed">("idle");

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
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      )}
    </div>
  );
}
