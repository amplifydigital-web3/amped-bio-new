"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import {
  ADULT_FAN_COPY as copy,
  type ContentAdultRefusal,
  type ContentCard,
  type ContentPublicItem,
  type ThemeConfig,
} from "@repo/constants";
import { StatutoryNotice, cn } from "@repo/ui";
import { trpcClient } from "@/lib/trpc";
import { ContentCardLink } from "./ContentCardView";
import { ItemPageView } from "./ItemPageView";
import { ReportContentButton } from "./ReportDialog";
import { CREATOR_FOCUS_RING, creatorSurface } from "./theme";

/**
 * 18+ on the public site (identity checks 4.4, adult content review 9, PR A1 with
 * R6). The landing app serves only empty shells for /{handle}/adult and
 * /{handle}/adult/{publicId}; everything below fills in the browser from the
 * signed in shelf calls, so no server HTML holds an 18+ title or cover.
 *
 * - AdultItemsCard: the one placeholder on the creator's page. No title, cover or count.
 * - AdultShelf: the Alabama warnings and the helpline (C1), then the Over 18 sheet
 *   step or the 18+ items in the creator's theme with the 18+ chip.
 * - AdultItem: one 18+ item page with the helpline.
 */

const PANEL_URL = process.env.NEXT_PUBLIC_PANEL_URL || "https://app.amped.bio";

export function adultShelfPath(handle: string): string {
  return `/${handle}/adult`;
}

export function adultItemPath(handle: string, publicId: string): string {
  return `/${handle}/adult/${publicId}`;
}

/** The Over 18 sheet on the app host, coming back to this page (identity checks 4.2). */
export function ageCheckUrl(here: string): string {
  return `${PANEL_URL}/age-check?returnTo=${encodeURIComponent(here)}`;
}

const ACTION = cn(
  "inline-flex min-h-[44px] items-center justify-center gap-[8px] rounded-full border border-current px-[21px] text-[15px] font-semibold",
  CREATOR_FOCUS_RING
);

export function AdultItemsCard({
  handle,
  theme,
}: {
  handle: string;
  theme: ThemeConfig | undefined;
}) {
  return (
    <Link
      href={adultShelfPath(handle)}
      data-adult-items-card
      className={cn("flex items-center gap-[13px] rounded-[21px] p-[21px]", CREATOR_FOCUS_RING)}
      style={creatorSurface(theme)}
    >
      <span
        aria-hidden
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-current text-[14px] font-bold"
      >
        {copy.chip}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-[24px]">{copy.cardTitle}</span>
        <span className="block text-[14px] leading-[20px] opacity-80">{copy.cardBody}</span>
      </span>
      <Lock aria-hidden className="h-5 w-5 shrink-0" />
    </Link>
  );
}

/** The Over 18 sheet step for a refusal, with the action that resolves it. */
export function AdultRefusal({
  reason,
  onRetry,
}: {
  reason: ContentAdultRefusal;
  onRetry: () => void;
}) {
  const here = typeof window === "undefined" ? "" : window.location.href;
  let body: string = copy.notAvailable;
  let action: React.ReactNode = null;
  switch (reason) {
    case "signed_out":
      body = copy.signedOut;
      action = (
        <a href={`/login?returnTo=${encodeURIComponent(here)}`} className={ACTION}>
          {copy.signIn}
        </a>
      );
      break;
    case "no_wallet":
    case "not_linked":
    case "not_verified":
      body = copy.verify;
      action = (
        <a href={ageCheckUrl(here)} className={ACTION}>
          {copy.checkAction}
        </a>
      );
      break;
    case "not_shared":
      body = copy.share;
      action = (
        <a href={ageCheckUrl(here)} className={ACTION}>
          {copy.checkAction}
        </a>
      );
      break;
    case "under_18":
      // No retry prompt (identity checks 4.2 and 4.5)
      body = copy.under18;
      break;
    case "unavailable":
      body = copy.unavailable;
      action = (
        <button type="button" onClick={onRetry} className={ACTION}>
          {copy.tryAgain}
        </button>
      );
      break;
    case "closed":
      body = copy.notAvailable;
      break;
  }
  return (
    <section
      aria-labelledby="adult-sheet-title"
      data-adult-refusal={reason}
      className="rounded-[21px] border border-current/20 p-[21px]"
    >
      <h2 id="adult-sheet-title" className="text-[20px] font-bold leading-[26px]">
        {copy.sheetTitle}
      </h2>
      <p className="mt-[4px] text-[16px] leading-[24px]">{body}</p>
      {action && <div className="mt-[13px]">{action}</div>}
    </section>
  );
}

type Load<T> =
  | { status: "loading" }
  | { status: "open"; data: T }
  | { status: "refused"; reason: ContentAdultRefusal }
  | { status: "failed" };

function Checking() {
  return (
    <p role="status" className="flex items-center gap-[8px] text-[16px]">
      <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
      {copy.checking}
    </p>
  );
}

function BackToPage({ handle }: { handle: string }) {
  return (
    <Link href={`/${handle}`} className={ACTION}>
      <ArrowLeft aria-hidden className="h-5 w-5" />
      {copy.backToPage}
    </Link>
  );
}

export function AdultShelf({ handle }: { handle: string }) {
  const [state, setState] = useState<Load<{ items: ContentCard[] }>>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await trpcClient.content.listAdultForBio.query({ handle });
      setState(
        result.open
          ? { status: "open", data: { items: result.page.items } }
          : { status: "refused", reason: result.reason }
      );
    } catch (error) {
      // A signed out fan gets UNAUTHORIZED from a private procedure
      const code = (error as { data?: { code?: string } } | null)?.data?.code;
      setState(
        code === "UNAUTHORIZED" ? { status: "refused", reason: "signed_out" } : { status: "failed" }
      );
    }
  }, [handle]);
  useEffect(() => {
    void load();
  }, [load]);

  const passed = state.status === "open";
  return (
    <div className="flex flex-col gap-[21px]">
      <header className="flex flex-wrap items-center justify-between gap-[13px]">
        <h1 className="text-[28px] font-bold leading-[34px]">{copy.shelfTitle}</h1>
        <BackToPage handle={handle} />
      </header>
      {/* Section 9(a)(1) on the shelf landing, and (a)(2) on every 18+ page (C1) */}
      <StatutoryNotice kind="warnings" />
      {state.status === "loading" && <Checking />}
      {state.status === "failed" && (
        <AdultRefusal reason="unavailable" onRetry={() => void load()} />
      )}
      {state.status === "refused" && (
        <AdultRefusal reason={state.reason} onRetry={() => void load()} />
      )}
      {passed &&
        (state.data.items.length === 0 ? (
          <p className="text-[16px]">{copy.empty}</p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-x-[21px] gap-y-[34px] lg:grid-cols-4">
              {state.data.items.map(card => (
                <li key={card.publicId} className="relative">
                  <span className="absolute left-[8px] top-[8px] z-10 rounded-full bg-black/70 px-[8px] py-[2px] text-[13px] font-bold text-white">
                    {copy.chip}
                  </span>
                  <ContentCardLink card={card} href={adultItemPath(handle, card.publicId)} />
                </li>
              ))}
            </ul>
            <ReportContentButton
              items={state.data.items.map(card => ({ publicId: card.publicId, title: card.title }))}
            />
          </>
        ))}
      <StatutoryNotice kind="helpline" />
    </div>
  );
}

export function AdultItem({ handle, publicId }: { handle: string; publicId: string }) {
  const [state, setState] = useState<Load<ContentPublicItem>>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await trpcClient.content.getAdult.query({ handle, publicId });
      setState(
        result.open
          ? { status: "open", data: result.item }
          : { status: "refused", reason: result.reason }
      );
    } catch (error) {
      const code = (error as { data?: { code?: string } } | null)?.data?.code;
      setState(
        code === "UNAUTHORIZED"
          ? { status: "refused", reason: "signed_out" }
          : code === "NOT_FOUND"
            ? { status: "refused", reason: "closed" }
            : { status: "failed" }
      );
    }
  }, [handle, publicId]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-[21px]">
      {state.status === "loading" && <Checking />}
      {state.status === "failed" && (
        <AdultRefusal reason="unavailable" onRetry={() => void load()} />
      )}
      {state.status === "refused" && (
        <>
          <StatutoryNotice kind="warnings" />
          <AdultRefusal reason={state.reason} onRetry={() => void load()} />
          <BackToPage handle={handle} />
        </>
      )}
      {state.status === "open" && (
        <>
          <span className="self-start rounded-full border border-current px-[8px] py-[2px] text-[13px] font-bold">
            {copy.chip}
          </span>
          <ItemPageView item={state.data} />
        </>
      )}
      {/* Section 9(a)(2): every 18+ item page */}
      <StatutoryNotice kind="helpline" />
    </div>
  );
}
