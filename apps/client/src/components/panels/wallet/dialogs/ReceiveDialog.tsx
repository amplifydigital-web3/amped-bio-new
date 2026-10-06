import { useEffect, useRef, useState } from "react";
import { useChainId, useChains } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Share2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Notice,
  Skeleton,
} from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { toast } from "@/components/ui/toast";

interface ReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 052 I08: how long Receive waits for an address before it says the wallet did not connect
const NO_ADDRESS_AFTER_MS = 10_000;

/** 052 I04: the full address in two balanced lines of 21 characters. */
function splitAddress(address: string) {
  const half = Math.ceil(address.length / 2);
  return [address.slice(0, half), address.slice(half)];
}

function useNetworkName() {
  const chainId = useChainId();
  const chains = useChains();
  return chains.find(chain => chain.id === chainId)?.name ?? "this network";
}

function IdentityRow() {
  const { profile } = useEditor();
  const [failed, setFailed] = useState(false);
  const letter = (profile.name?.trim() || profile.handle || "?").charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-[13px]">
      {profile.photoUrl && !failed ? (
        <img
          src={profile.photoUrl}
          alt=""
          onError={() => setFailed(true)}
          className="h-[34px] w-[34px] shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(22,21,43,0.10)]"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] text-prism-meta font-bold text-prism-nav-pressed shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
        >
          {letter}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-prism-label font-semibold text-prism-ink">
          {profile.name || `@${profile.handle}`}
        </p>
        <p className="truncate text-prism-meta text-prism-ink-2">
          @{profile.handle} · Share this code or address to receive tREVO.
        </p>
      </div>
    </div>
  );
}

function ReceiveSkeleton() {
  return (
    <div aria-busy aria-label="Loading your address" className="space-y-[21px]">
      <div className="flex items-center gap-[13px]">
        <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2 rounded-prism-5" />
          <Skeleton className="h-3 w-2/3 rounded-prism-5" />
        </div>
      </div>
      <Skeleton className="mx-auto h-[259px] w-[259px] rounded-prism-13" />
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-4 w-[233px] rounded-prism-5" />
        <Skeleton className="h-4 w-[233px] rounded-prism-5" />
      </div>
    </div>
  );
}

function ReceiveBody({ address, network }: { address: string; network: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const [first, second] = splitAddress(address);

  // 052 I04: Copied with a check for 2 s, and the Address copied toast (role=status)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      toast.add({ type: "success", title: "Address copied" });
    } catch {
      toast.add({ type: "error", title: "Could not copy the address" });
    }
  };

  // 052 I05: shares the raw address
  const share = async () => {
    try {
      await navigator.share({ text: `My tREVO address on ${network}: ${address}` });
    } catch {
      // The person closed the share sheet; nothing to report
    }
  };

  return (
    <div className="space-y-[21px]">
      <IdentityRow />

      {/* 052 I06: white tile r13, padding 13, a 233 QR in ink, level M, raw address payload */}
      <div className="mx-auto w-fit rounded-prism-13 bg-white p-[13px]">
        <QRCodeSVG
          value={address}
          size={233}
          level="M"
          fgColor="#16152B"
          bgColor="#FFFFFF"
          role="img"
          aria-label="QR code for your wallet address"
          className="block"
        />
      </div>

      <div className="space-y-[13px]">
        <p
          aria-label="Wallet address"
          className="select-all text-center text-prism-label font-semibold tabular-nums text-prism-ink"
        >
          <span className="block">{first}</span>
          <span className="block">{second}</span>
        </p>
        <div className="flex gap-[13px] max-sm:flex-col">
          <Button type="button" size="lg" onClick={() => void copy()} className="flex-1">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy address"}
          </Button>
          {canShare && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void share()}
              className="max-sm:w-full"
            >
              <Share2 aria-hidden />
              Share
            </Button>
          )}
        </div>
      </div>

      {/* 052 I07: one solid compliance notice */}
      <Notice variant="warning" title="Testnet only.">
        <p>
          tREVO has no cash value. Pool rewards come from the network, vary, and are not guaranteed.
          Send only {network} tREVO to this address. Tokens sent from another network can be lost.
        </p>
      </Notice>
    </div>
  );
}

/**
 * Screen Review 052. Receive tREVO on the shared Prism Dialog (bottom sheet
 * below 640): identity row, QR, the full address, Copy address and Share, then
 * the testnet notice. The address comes from the wallet context (saved account
 * address first), the same source as the header chip, so Receive keeps working
 * when a reconnect fails.
 */
function ReceiveDialog({ open, onOpenChange }: ReceiveDialogProps) {
  const wallet = useWalletContext();
  const network = useNetworkName();
  const address = wallet.address;
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const showSkeleton = useDelayed(open && !address, 400);

  useEffect(() => {
    if (!open || address) return setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), NO_ADDRESS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open, address, attempt]);

  const retry = () => {
    setTimedOut(false);
    setAttempt(current => current + 1);
    void wallet.connect().catch(() => undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-prism-panel-title text-prism-ink">Receive tREVO</DialogTitle>
          <DialogDescription className="text-prism-meta text-prism-ink-2">
            On {network}
          </DialogDescription>
        </DialogHeader>

        {address ? (
          <ReceiveBody address={address} network={network} />
        ) : timedOut ? (
          <ErrorCard
            title="Wallet did not connect"
            cause="Your wallet is created when you sign in. Reconnect to load it."
            retryLabel="Retry"
            onRetry={retry}
          />
        ) : showSkeleton ? (
          <ReceiveSkeleton />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default ReceiveDialog;
