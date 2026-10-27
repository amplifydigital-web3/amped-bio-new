import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button, Skeleton } from "@repo/ui";
import { RNS_FLAGS } from "@/config/rns/flags";
import { useDelayed } from "@/hooks/useDelayed";
import { shortAddress } from "./model";
import { useRecipientTrust, type ResolvedTrust } from "./useRecipientTrust";

/** 110 I06: the compact status chip for the Review To row. */
export function TrustChip({ trust }: { trust: ResolvedTrust | null }) {
  if (!trust || trust.verification === "off") return null;
  if (trust.verifiedOwner) {
    return (
      <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-prism-8 bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav-pressed">
        <ShieldCheck aria-hidden className="h-4 w-4" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center rounded-prism-8 bg-prism-warning-bg px-2 text-prism-meta font-semibold text-prism-warning-ink shadow-[inset_0_0_0_1px_rgba(122,79,0,0.28)]">
      Not verified
    </span>
  );
}

/**
 * Screen Review 110 I03, I08, I11: who the sender pays. Verified owner on the
 * slab surface, or the caution on the solid notice. Senders always see one
 * of the two (110 D1); the card never shows Authbase attributes. An aria-live
 * region announces the status when it changes (I14).
 */
export function TrustCard({ query }: { query: string | null | undefined }) {
  const trust = useRecipientTrust(query);
  const showSkeleton = useDelayed(trust.isPending && trust.fetchStatus !== "idle", 400);
  if (!RNS_FLAGS.enabled || !query) return null;

  let content: React.ReactNode = null;
  if (trust.isPending) {
    content = showSkeleton ? (
      <div className="prism-slab space-y-2 !rounded-prism-21 p-4">
        <Skeleton className="h-3.5 w-1/3 rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>
    ) : null;
  } else if (trust.isError) {
    content = (
      <Caution
        lead=""
        text="We could not check the owner right now."
        action={
          <Button type="button" variant="ghost" onClick={() => void trust.refetch()}>
            Retry
          </Button>
        }
      />
    );
  } else if (trust.data?.status === "ok") {
    const data = trust.data;
    if (data.verification === "off") {
      content = null;
    } else if (data.verification === "unavailable") {
      content = (
        <Caution
          lead=""
          text="We could not check the owner right now."
          action={
            <Button type="button" variant="ghost" onClick={() => void trust.refetch()}>
              Retry
            </Button>
          }
        />
      );
    } else if (data.verifiedOwner) {
      content = (
        <div className="prism-slab flex items-start gap-3 !rounded-prism-21 p-4">
          <ShieldCheck aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
          <p className="text-prism-meta text-prism-ink">
            <b className="font-bold text-prism-success">Verified owner.</b> Owner&apos;s ID checked
            by Authbase.{" "}
            {data.name
              ? `This name points to ${shortAddress(data.resolvedAddress)}.`
              : `This wallet is ${shortAddress(data.resolvedAddress)}.`}
          </p>
        </div>
      );
    } else if (!data.pointsToOwner) {
      content = (
        <Caution text="This name points to a different wallet than its owner. Check with the owner before you send." />
      );
    } else {
      content = (
        <Caution text="Check the address with the owner before you send. Names can look alike." />
      );
    }
  }

  return (
    <div aria-live="polite" className="empty:hidden">
      {content}
    </div>
  );
}

function Caution({
  lead = "Not verified.",
  text,
  action,
}: {
  lead?: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="prism-notice flex flex-wrap items-start gap-2 !rounded-prism-21">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
      />
      <p className="min-w-0 flex-1 text-prism-meta text-prism-ink">
        {lead && <b className="font-bold text-prism-warning-ink">{lead} </b>}
        {text}
      </p>
      {action}
    </div>
  );
}
