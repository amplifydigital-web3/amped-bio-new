"use client";

import * as React from "react";
import { Check, CircleAlert, EyeOff, Info, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "../button";
import { Notice } from "../prism/states";
import { cn } from "../utils";
import { buildFacetLearnLists, formatProofLifetime, type FacetDescription } from "./facet-scopes";

/**
 * Screen Review 107: the one FacetRequestCard. An app asks the owner to prove
 * one fact. The editor Dialog (client, over the RNS name page) and the
 * Sign in with Amped.Bio consent page render this same card (I01), so the two
 * channels never drift.
 *
 * The card only renders what it receives. Who asks comes from verified data
 * (I02); the lists come from every requested scope (I03); the expiry line
 * comes from the server (I07). It never calls an API itself.
 */

export type FacetRequester = {
  /** App name from the client record. Never trusted on its own (I02). */
  name: string;
  /** Host of client_uri, as the consent screen shows it */
  host: string | null;
  logoUri: string | null;
  /** The RNS name of the client owner, set only when the owner is verified */
  rnsName: string | null;
  /** True only when the owner's wallet resolves from rnsName and Authbase reports VERIFIED */
  verified: boolean;
};

export type FacetRequestState =
  | "ready"
  | "working"
  | "error"
  | "cannot_prove"
  | "not_verified"
  | "tier_too_low"
  | "expired";

export type FacetRequestChannel = "editor" | "consent";

export interface FacetRequestCardProps {
  channel: FacetRequestChannel;
  state: FacetRequestState;
  requester: FacetRequester;
  facet: FacetDescription;
  /** Every scope in the request, facet scopes included */
  scopes: string[];
  /** Proof lifetime from the server (proof exp) */
  proofTtlSeconds: number;
  /** The title element. The editor Dialog passes DialogTitle. */
  titleAs?: React.ElementType;
  titleRef?: React.Ref<HTMLHeadingElement>;
  titleId?: string;
  onShare: () => void;
  onDecline: () => void;
  /** Close on cannot prove (answers the app exactly as Decline) and on expired */
  onClose: () => void;
  /** Not verified and tier too low: opens the Identity tab (row 103) */
  onVerify: () => void;
  onRetry: () => void;
  className?: string;
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "A";
}

/** 44 art tile r13: the app logo, or its initials on the dark tile. */
function RequesterArt({ requester }: { requester: FacetRequester }) {
  if (requester.logoUri) {
    return (
      <img
        src={requester.logoUri}
        alt=""
        className="h-touch w-touch shrink-0 rounded-prism-13 object-cover shadow-prism-e1"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-gradient-to-br from-[#6B6A80] to-[#16152B] text-prism-meta font-bold text-white shadow-prism-e1"
    >
      {initials(requester.name)}
    </span>
  );
}

/** P03: the requested fact. G2 slab r21, icon tile 44 on nav tint, 26/33 fact, 13/16 source. */
function FacetSlab({ facet }: { facet: FacetDescription }) {
  return (
    <div className="prism-slab flex items-center gap-[21px] p-[21px]">
      <span
        aria-hidden
        className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-prism-nav-tint"
      >
        <ShieldCheck className="h-[21px] w-[21px] text-prism-nav-pressed" />
      </span>
      <div className="min-w-0">
        <p className="text-prism-card-title text-prism-ink">{facet.label}</p>
        <p className="mt-1 text-prism-meta text-prism-ink-2">{facet.source}</p>
      </div>
    </div>
  );
}

/** P04: one neutral well per list (I11). Green only on the check icons. */
function LearnWell({
  heading,
  items,
  kind,
}: {
  heading: string;
  items: string[];
  kind: "learn" | "not";
}) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-prism-13 bg-[rgba(22,21,43,0.04)] p-[13px] shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
    >
      <h3 id={headingId} className="text-prism-eyebrow uppercase text-prism-ink-2">
        {heading}
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2 text-prism-label text-prism-ink">
            {kind === "learn" ? (
              <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-prism-success" />
            ) : (
              <EyeOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-prism-ink-2" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Footer row. Desktop: right aligned, primary last. Mobile: full width, Decline above the primary (I10). */
function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end [&>button]:max-sm:w-full">
      {children}
    </div>
  );
}

export function FacetRequestCard({
  channel,
  state,
  requester,
  facet,
  scopes,
  proofTtlSeconds,
  titleAs: Title = "h2",
  titleRef,
  titleId,
  onShare,
  onDecline,
  onClose,
  onVerify,
  onRetry,
  className,
}: FacetRequestCardProps) {
  const lists = buildFacetLearnLists(scopes, facet);
  const working = state === "working";
  const shareable = state === "ready" || state === "working" || state === "error";
  // 107 I02: the requester line only for a verified owner with an RNS name
  const verifiedRequester = requester.verified && !!requester.rnsName;
  const trustTarget = requester.host ?? "this app";
  const title =
    channel === "consent"
      ? `${requester.name} asks you to sign in and prove one fact`
      : `${requester.name} asks you to prove one fact`;

  return (
    <div className={cn("flex flex-col gap-[21px] font-prism", className)} aria-busy={working}>
      {/* P02: requester header */}
      <div className={cn("flex items-start gap-3", channel === "editor" && "pr-12")}>
        <RequesterArt requester={requester} />
        <div className="min-w-0">
          <Title
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="text-prism-panel-title text-prism-ink outline-none"
          >
            {title}
          </Title>
          {requester.host && (
            <p className="mt-1 break-all text-prism-meta text-prism-ink-2">{requester.host}</p>
          )}
        </div>
      </div>

      {/* 107 I02, states board A: the solid notice replaces the requester line */}
      {shareable && !verifiedRequester && (
        <Notice variant="warning" title="This app is not verified.">
          Only share if you trust {trustTarget}.
        </Notice>
      )}

      <FacetSlab facet={facet} />

      {shareable && (
        <>
          <div className="grid gap-[13px] sm:grid-cols-2">
            <LearnWell heading="They learn" items={lists.learn} kind="learn" />
            <LearnWell heading="They do not learn" items={lists.notLearn} kind="not" />
          </div>

          {/* P05, 107 I07: from the server value */}
          <p className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Proof expires in {formatProofLifetime(proofTtlSeconds)}. You can see it later under
              Proofs you shared.
            </span>
          </p>

          {/* 107 I06: error keeps the request; nothing is shared */}
          {state === "error" && (
            <div
              role="alert"
              className="prism-raised flex items-start gap-3 rounded-prism-13 px-[13px] py-3 text-prism-body text-prism-ink"
            >
              <CircleAlert
                aria-hidden
                className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-ink-2"
              />
              <p>Could not create the proof. Try again. Nothing was shared.</p>
            </div>
          )}

          <Actions>
            <Button type="button" variant="ghost" onClick={onDecline} disabled={working}>
              Decline
            </Button>
            {state === "error" ? (
              <Button type="button" size="lg" onClick={onRetry}>
                Retry
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={onShare}
                disabled={working}
                aria-busy={working}
              >
                {working && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
                Share proof
              </Button>
            )}
          </Actions>
          {working && (
            <p className="sr-only" role="status">
              Creating the proof.
            </p>
          )}
        </>
      )}

      {/* 107 I04: cannot prove. Close answers the app exactly as Decline. */}
      {state === "cannot_prove" && (
        <>
          <p className="text-prism-body text-prism-ink">Authbase cannot confirm this for you.</p>
          <Actions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </Actions>
        </>
      )}

      {/* 107 I08: owner not verified, or the check tier is too low */}
      {(state === "not_verified" || state === "tier_too_low") && (
        <>
          <p className="text-prism-body text-prism-ink">
            {state === "not_verified"
              ? "You need a verified identity to share this."
              : "This needs the Enhanced check."}
          </p>
          <Actions>
            <Button type="button" variant="ghost" onClick={onDecline}>
              Decline
            </Button>
            <Button type="button" size="lg" onClick={onVerify}>
              <ShieldCheck aria-hidden />
              {state === "not_verified" ? "Verify with Authbase" : "Get the Enhanced check"}
            </Button>
          </Actions>
        </>
      )}

      {/* 107 I07: the request itself expired */}
      {state === "expired" && (
        <>
          <p className="text-prism-body text-prism-ink">
            This request expired. Go back to the app and try again.
          </p>
          <Actions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </Actions>
        </>
      )}

      {/* P07: verified requester line */}
      {shareable && verifiedRequester && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-prism-line pt-[13px] text-prism-meta text-prism-ink-2">
          <span>Requested by {requester.rnsName}.</span>
          <span className="inline-flex h-[26px] items-center gap-1 rounded-prism-8 bg-prism-nav-tint px-2 font-semibold text-prism-ink-2">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            Verified owner
          </span>
        </div>
      )}
    </div>
  );
}
