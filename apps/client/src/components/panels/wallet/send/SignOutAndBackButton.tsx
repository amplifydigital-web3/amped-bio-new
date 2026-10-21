import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button, type ButtonProps } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { signInUrl } from "@/components/shell/ShellGate";

/**
 * Ends the wallet session and the Amped.Bio session, then lands on sign in so
 * the next account opens its own wallet. Used wherever a wallet from another
 * account blocks signing: retrying in place cannot help, because the start of
 * the flow reads the account's saved wallet again.
 *
 * Owns its pending and failure states, so a sign out that throws keeps the
 * person on the page with a way to try again instead of an unhandled rejection.
 */
export function SignOutAndBackButton({
  label = "Sign out and sign back in",
  variant = "secondary",
  className,
}: {
  label?: string;
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const wallet = useWalletContext();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setPending(true);
    setFailed(false);
    try {
      await wallet.signOutEverywhere();
      window.location.href = signInUrl();
    } catch (error) {
      console.error("[wallet-session] sign out failed", error);
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size="lg"
        className="w-full"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void run()}
      >
        {pending ? (
          <Loader2 aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <LogOut aria-hidden />
        )}
        {label}
      </Button>
      {failed && (
        <p role="alert" className="mt-2 text-prism-meta font-semibold text-prism-danger">
          Could not sign out. Try again.
        </p>
      )}
    </div>
  );
}
