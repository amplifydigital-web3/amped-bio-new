"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import {
  ACCESS_STAKE_DISCLOSURE,
  TESTNET_NOTICE,
  type AccessDecision,
  type ContentCard,
  type ContentGate,
  type ContentPlayback,
  type ContentPreview,
} from "@repo/constants";
import { cn } from "@repo/ui";
import { trpcClient } from "@/lib/trpc";
import { useFeatureFlag } from "@/components/providers/FeatureFlagsProvider";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

const g = copy.gate;
const PANEL_URL = process.env.NEXT_PUBLIC_PANEL_URL || "https://app.amped.bio";

/**
 * Decisions for the locked cards on a page (content gating 4.2), asked after
 * hydration with access.checkPage. Server HTML never depends on the viewer.
 */
export function useCardDecisions(handle: string, cards: ContentCard[]) {
  const on = useFeatureFlag("accessGating");
  const [decisions, setDecisions] = useState<Record<string, AccessDecision>>({});
  const ids = cards
    .filter(card => card.gate)
    .map(card => card.publicId)
    .slice(0, 48);
  const key = ids.join(",");
  useEffect(() => {
    if (!on || !key) return;
    let live = true;
    trpcClient.access.checkPage
      .query({ handle, resources: key.split(",").map(id => ({ type: "content", id })) })
      .then(result => live && setDecisions(result))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [on, handle, key]);
  return (publicId: string) => decisions[`content:${publicId}`] ?? null;
}

/** The lock over a locked card's blur: Locked with the rule, or Open for you after checkPage. */
export function CardLock({
  gate,
  decision,
}: {
  gate: ContentGate;
  decision: AccessDecision | null;
}) {
  const open = decision?.allowed === true;
  const Icon = open ? LockOpen : Lock;
  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-black/55 text-white">
          <Icon className="h-5 w-5" />
        </span>
      </span>
      <span className="absolute bottom-[8px] left-[8px] inline-flex h-[29px] max-w-[calc(100%-16px)] items-center gap-[6px] rounded-full bg-white px-[10px] text-[13px] font-semibold text-[#16152B] shadow">
        <span className="truncate">{open ? g.unlocked : gate.summary}</span>
      </span>
      <span className="sr-only">{open ? g.unlocked : g.lockedFor(gate.summary)}</span>
    </>
  );
}

/** TESTNET_NOTICE above ACCESS_STAKE_DISCLOSURE, on every stake step (gating 3.11). */
export function StakeNotices() {
  return (
    <div className="mt-[13px] space-y-[4px] rounded-[13px] bg-black/5 p-[13px] text-[14px] leading-[20px]">
      <p className="font-semibold">{TESTNET_NOTICE}</p>
      <p className="opacity-90">{ACCESS_STAKE_DISCLOSURE}</p>
    </div>
  );
}

const BUTTON = cn(
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-current px-[21px] text-[16px] font-semibold",
  CREATOR_FOCUS_RING
);

function Action({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={cn(BUTTON, "!bg-[#16152B] text-white")}>
      {children}
    </Link>
  );
}

/**
 * The unlock card (content gating 4.2): one step per hint. Never "buy" or
 * "join" before PR 10 and PR 11; never an amount in public HTML.
 */
export function UnlockCard({
  decision,
  gate,
  handle,
  onFollowed,
}: {
  decision: AccessDecision;
  gate: ContentGate;
  handle: string;
  onFollowed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = decision.hint;
  const stake = gate.stake;
  const here = typeof window === "undefined" ? `/${handle}` : window.location.pathname;

  const follow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await trpcClient.follow.follow.mutate({ handle, source: "page" });
      if (!result.pending) onFollowed();
      else setError(g.confirmBody);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : g.failed);
    } finally {
      setBusy(false);
    }
  }, [handle, onFollowed]);

  let title: string = g.unavailableTitle;
  let body: string = g.unavailableBody;
  let action: React.ReactNode = null;
  switch (hint.action) {
    case "sign_in":
      title = g.signInTitle;
      body = g.signInBody;
      action = <Action href={`/login?returnTo=${encodeURIComponent(here)}`}>{g.signIn}</Action>;
      break;
    case "follow":
      title = g.followTitle;
      body = g.followBody(hint.creatorHandle);
      action = (
        <button
          type="button"
          disabled={busy}
          onClick={() => void follow()}
          className={cn(BUTTON, "!bg-[#16152B] text-white disabled:opacity-60")}
        >
          {busy ? g.following : g.follow}
        </button>
      );
      break;
    case "confirm_email":
      title = g.confirmTitle;
      body = g.confirmBody;
      break;
    case "view_pool":
      title = decision.reason === "stake_below_min" ? g.stakeBelowTitle : g.poolTitle;
      body = g.poolBody;
      action = gate.poolAddress ? (
        <Action href={`/i/pools/${gate.poolAddress}`}>{g.goToPool}</Action>
      ) : null;
      break;
    case "link_wallet":
      title = g.walletTitle;
      body = g.walletBody;
      action = <Action href={PANEL_URL}>{g.openAccount}</Action>;
      break;
    case "verify_age":
      title = g.ageTitle;
      body = g.ageBody;
      action = <Action href={PANEL_URL}>{g.openAccount}</Action>;
      break;
    case "none":
      if (decision.reason === "blocked") body = g.blockedBody;
      if (decision.reason === "age_check_required") body = g.ageNone;
      break;
    default:
      break;
  }

  return (
    <section
      aria-labelledby="unlock-title"
      className="mt-[21px] rounded-[21px] border border-current/20 p-[21px]"
    >
      <p className="flex items-center gap-[6px] text-[13px] font-semibold uppercase tracking-[0.06em] opacity-80">
        <Lock className="h-4 w-4" aria-hidden />
        {gate.summary}
      </p>
      <h2 id="unlock-title" className="mt-[4px] text-[20px] font-bold leading-[26px]">
        {title}
      </h2>
      <p className="mt-[4px] text-[16px] leading-[24px] opacity-90">{body}</p>
      {action && <div className="mt-[13px]">{action}</div>}
      {error && (
        <p role="alert" className="mt-[8px] text-[14px] font-semibold">
          {error}
        </p>
      )}
      {stake && <StakeNotices />}
    </section>
  );
}

export type LockedState =
  | { status: "checking" }
  | { status: "locked"; decision: AccessDecision }
  | { status: "open"; playback: ContentPlayback | null }
  | { status: "failed" };

/**
 * One call reveal (content gating 3.3): getReadUrl answers with playback on a
 * pass and the decision on a refusal, so the page unlocks in place.
 */
export function useUnlock(publicId: string) {
  const [state, setState] = useState<LockedState>({ status: "checking" });
  const [preview, setPreview] = useState<ContentPreview | null>(null);
  const run = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const result = await trpcClient.content.getReadUrl.query({ publicId });
      if (result.decision && !result.decision.allowed) {
        setState({ status: "locked", decision: result.decision });
        trpcClient.content.getPreview
          .query({ publicId })
          .then(setPreview)
          .catch(() => undefined);
      } else setState({ status: "open", playback: result.playback });
    } catch {
      setState({ status: "failed" });
    }
  }, [publicId]);
  useEffect(() => {
    void run();
  }, [run]);
  return { state, preview, retry: run };
}
