import { ShieldCheck } from "lucide-react";
import { ErrorCard, Notice, Skeleton } from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { RNS_COPY } from "@/config/rns/copy";
import {
  useAuthbaseIdentityStatus,
  useMyAuthbaseStatus,
} from "@/hooks/rns/useAuthbaseIdentityStatus";
import { RowBadge, VerifiedChip } from "../shared";
import { isBound, type RnsNameState } from "../name/useRnsName";
import { AUTHBASE_URL } from "./catalog";
import { authbaseDate } from "./dates";
import { IdentityPromo } from "./IdentityPromo";
import { IdentityVerified } from "./IdentityVerified";
import { IdEyebrow } from "./parts";
import { SharedAttributes } from "./SharedAttributes";

function IdentitySkeleton() {
  return (
    <div aria-busy aria-label="Loading identity" className="space-y-[21px]">
      <div className="prism-glass-clear space-y-3 p-[34px]">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-7 w-2/3 rounded-full" />
        <Skeleton className="h-4 w-1/2 rounded-full" />
        <Skeleton className="h-touch w-56 rounded-full" />
      </div>
      <div className="grid gap-[13px] md:grid-cols-2">
        <Skeleton className="h-[180px] rounded-prism-21" />
        <Skeleton className="h-[180px] rounded-prism-21" />
      </div>
    </div>
  );
}

/** 103 I17: Authbase unavailable. */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorCard
      title="We could not check verification right now"
      cause="Try again in a minute."
      onRetry={onRetry}
      retryLabel="Retry"
      className="!rounded-prism-21"
    />
  );
}

/**
 * 103 I02: the status card. Visitors see this: the RNS name, Verified or
 * Not verified, the dates and the disclaimer. No prices or plans. Shared
 * attributes follow under the 079 D2 rule only.
 * Verified needs the name bound to the owner's wallet (I04, 104 I12).
 */
function StatusCard({
  fullName,
  verified,
  validUntil,
}: {
  fullName: string;
  verified: boolean;
  validUntil?: string | null;
}) {
  return (
    <section
      aria-labelledby="rns-identity-status"
      className="prism-glass-clear flex flex-wrap items-start gap-[21px] p-[21px] sm:p-[34px]"
    >
      <span
        aria-hidden
        className="inline-flex h-commit w-commit shrink-0 items-center justify-center rounded-prism-13 bg-prism-nav-tint"
      >
        <ShieldCheck className="h-[34px] w-[34px] text-prism-nav-pressed" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <IdEyebrow>Identity</IdEyebrow>
        <h2 id="rns-identity-status" className="flex flex-wrap items-center gap-2">
          <span className="break-all text-[20px] font-bold leading-[23px] text-prism-ink">
            {fullName}
          </span>
          {verified ? <VerifiedChip /> : <RowBadge>Not verified</RowBadge>}
        </h2>
        {verified ? (
          <>
            <p className="text-prism-body text-prism-ink">
              {RNS_COPY.verifiedBy}
              {validUntil ? `. Valid until ${authbaseDate(validUntil)}.` : "."}
            </p>
            <p className="text-prism-meta text-prism-ink-2">{RNS_COPY.verifiedDisclaimer}</p>
          </>
        ) : (
          <p className="text-prism-body text-prism-ink-2">
            The owner of this RNS name has not verified their identity with Authbase.
          </p>
        )}
      </div>
    </section>
  );
}

/** 103 I17, 104 I12: why a badge cannot show with this name. */
function BindingNotice({ name }: { name: RnsNameState }) {
  if (isBound(name)) return null;
  if (!name.resolvedAddress) {
    return (
      <Notice variant="info" title="Not linked to a wallet.">
        Set this name&apos;s address to your wallet to show your badge with it.
      </Notice>
    );
  }
  return (
    <Notice variant="info" title="This name points to a different wallet.">
      The badge shows with an RNS name only when the name points to your wallet.
    </Notice>
  );
}

function VisitorIdentity({ name, chainId }: { name: RnsNameState; chainId: number }) {
  const status = useAuthbaseIdentityStatus(name.owner);
  const fullName = formatRnsName(name.label, chainId);
  if (status.isPending) return <IdentitySkeleton />;
  if (status.isError || !status.data) return <Unavailable onRetry={() => void status.refetch()} />;
  const verified = status.data.verified && isBound(name);
  return (
    <div className="space-y-[21px]">
      <StatusCard
        fullName={fullName}
        verified={verified}
        validUntil={status.data.verification?.valid_until}
      />
      {/* 079 D2: only for Verified. The server returns attributes only under RNS_PUBLIC_ATTRIBUTES. */}
      {verified && <SharedAttributes attributes={status.data.attributes ?? {}} viewer="visitor" />}
    </div>
  );
}

function OwnerIdentity({
  name,
  chainId,
  explorer,
}: {
  name: RnsNameState;
  chainId: number;
  explorer?: string;
}) {
  const mine = useMyAuthbaseStatus(true);
  const fullName = formatRnsName(name.label, chainId);
  if (mine.isPending) return <IdentitySkeleton />;
  if (mine.isError) return <Unavailable onRetry={() => void mine.refetch()} />;

  const status = mine.data;
  // An account without a wallet on the server reads as not linked
  if (!status) {
    return (
      <Notice variant="info" title="Your account has no wallet yet.">
        Connect your wallet in Wallet to verify this RNS name.
      </Notice>
    );
  }

  if (status.status === "VERIFIED" || status.status === "VERIFIED_WITH_BADGE") {
    return (
      <div className="space-y-[21px]">
        <BindingNotice name={name} />
        <IdentityVerified
          label={name.label}
          chainId={chainId}
          status={status}
          explorer={explorer}
        />
      </div>
    );
  }

  // 103 I18: without the Authbase link there is nothing to start, so the owner sees the status card
  if (!AUTHBASE_URL) {
    return <StatusCard fullName={fullName} verified={false} />;
  }

  return (
    <div className="space-y-[21px]">
      <BindingNotice name={name} />
      <IdentityPromo
        label={name.label}
        chainId={chainId}
        avatar={name.records.avatar}
        linked={status.status === "NOT_VERIFIED"}
        attributes={status.attributes}
      />
    </div>
  );
}

/**
 * Screen Review 103, 104: the Identity tab of the RNS name page, in two views
 * (103 I02). The owner (connected wallet owns the name) gets the full tab from
 * authbase.getMyStatus, which the server keys to the session wallet. Everyone
 * else gets the status card from the public lookup, which carries attributes
 * only for a Verified wallet and only when the server turns on 079 D2.
 */
export function IdentityTab({
  name,
  chainId,
  explorer,
}: {
  name: RnsNameState;
  chainId: number;
  explorer?: string;
}) {
  return (
    <div className="font-prism">
      {name.isOwner ? (
        <OwnerIdentity name={name} chainId={chainId} explorer={explorer} />
      ) : (
        <VisitorIdentity name={name} chainId={chainId} />
      )}
    </div>
  );
}
