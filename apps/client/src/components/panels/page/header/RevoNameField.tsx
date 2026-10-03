import { AlertTriangle, X } from "lucide-react";
import { useAccount } from "wagmi";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import useGetAllRegisteredNames from "@/hooks/rns/useGetAllRegisteredNames";
import { isRevoNameExpired } from "@/utils/rns";

// Screen Review 018 I07 to I09. The RNS name in the profile header card, shown
// only when RNS is on (D06). Registration and renewal stay in Wallet.
// 100 I04: expired means the registration expired; the grace period counts as
// expired. 100 I12: the field reads RNS name, never RevoName.

// 101 I01: RNS names live in the Wallet RNS tab
function useGoToNames() {
  const { setActivePanelAndNavigate } = useEditor();
  return () => setActivePanelAndNavigate("wallet", undefined, { tab: "rns" });
}

/** 018 I09: the expired or lost name notice, in the card instead of a modal. */
export function RevoNameNotice() {
  const { expiredRevoName, lostRevoName, dismissRevoName } = useEditor();
  const goToNames = useGoToNames();
  const name = expiredRevoName || lostRevoName;
  if (!name) return null;
  return (
    <div role="status" className="prism-notice flex items-start gap-3">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
      />
      <div className="min-w-0 flex-1 text-[16px] leading-6">
        <p className="font-bold text-prism-warning-ink">
          {expiredRevoName
            ? "Your RNS name expired"
            : "Your RNS name is no longer linked to your wallet"}
        </p>
        <p className="text-prism-ink">
          <span className="break-all">{name}</span> no longer shows on your page. Register it again
          or pick another name.
        </p>
        <Button variant="ghost" className="-ml-3 mt-1" onClick={goToNames}>
          Manage in Wallet
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => void dismissRevoName()}
        className="prism-icon-btn prism-focus shrink-0"
      >
        <X aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
      </button>
    </div>
  );
}

export function RevoNameField() {
  const { profile, setProfile, revoNameError } = useEditor();
  const { address, isConnected } = useAccount();
  const goToNames = useGoToNames();
  const { revoNames, isFetching } = useGetAllRegisteredNames(address, isConnected, true);

  const current = profile.revoName ?? "";
  const names = revoNames ?? [];
  const currentMissing = current && !names.some(n => n.name === current);

  let helper: React.ReactNode = null;
  if (!isConnected) {
    helper = (
      <>
        Connect a wallet in Wallet to use an RNS name.{" "}
        <Button variant="link" className="h-auto min-h-0 p-0 text-prism-meta" onClick={goToNames}>
          Go to Wallet
        </Button>
      </>
    );
  } else if (!isFetching && names.length === 0 && !current) {
    helper = (
      <>
        You have no RNS names yet.{" "}
        <Button variant="link" className="h-auto min-h-0 p-0 text-prism-meta" onClick={goToNames}>
          Get an RNS name
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      <label id="revoname-label" className="block text-prism-label font-semibold text-prism-ink">
        RNS name
      </label>
      <Select
        value={current || "none"}
        onValueChange={value => setProfile({ ...profile, revoName: value === "none" ? "" : value })}
        disabled={isFetching}
      >
        <SelectTrigger
          aria-labelledby="revoname-label"
          aria-describedby={revoNameError ? "revoname-error" : undefined}
          className="w-full"
        >
          <SelectValue placeholder={isFetching ? "Loading your names" : "None"} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="none">None</SelectItem>
          {currentMissing && <SelectItem value={current}>{current}</SelectItem>}
          {names.map(name => {
            const expired = isRevoNameExpired(name.expiryDateWithGrace);
            return (
              <SelectItem key={name.name} value={name.name} disabled={expired}>
                <span>{name.name}</span>
                {expired && (
                  <Badge variant="warning" className="ml-2">
                    Expired
                  </Badge>
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {revoNameError && (
        <p id="revoname-error" role="alert" className="text-prism-meta text-prism-danger">
          {revoNameError}
        </p>
      )}
      {helper && <p className="text-prism-meta text-prism-ink-2">{helper}</p>}
      <Button variant="ghost" className="-ml-3" onClick={goToNames}>
        Manage in Wallet
      </Button>
    </div>
  );
}
