import { useId, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Users,
} from "lucide-react";
import { PROCESSING_TXID } from "@repo/constants";
import { Button, EmptyState, ErrorCard, Skeleton, cn, trpc, trpcClient, useAuth } from "@repo/ui";
import type { RouterOutputs } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { TestnetLine } from "../../explore/pool-panel/sections";
import { ClaimReviewPanel, type ClaimTarget } from "./ClaimReviewPanel";
import {
  Avatar,
  REFERRALS_ARTICLE,
  UNAVAILABLE,
  formatJoined,
  profileUrl,
  shortTx,
  txUrl,
  walletsLine,
} from "./shared";

type Referral = RouterOutputs["referral"]["myReferrals"]["referrals"][number];

const PAGE_SIZE = 10;

function RowSkeleton() {
  return (
    <li className="flex h-commit items-center gap-3 border-b border-prism-line last:border-b-0">
      <Skeleton className="h-[34px] w-[34px] rounded-full" />
      <span className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3 rounded-full" />
        <Skeleton className="h-3 w-1/4 rounded-full" />
      </span>
      <Skeleton className="h-touch w-[110px] rounded-prism-13" />
    </li>
  );
}

/** 060 I06: every status reads without hover. */
function ReferralStatus({
  referral,
  available,
  claiming,
  onClaim,
}: {
  referral: Referral;
  available: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  if (referral.txid === PROCESSING_TXID) {
    return (
      <span className="inline-flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
        <Clock aria-hidden className="h-[21px] w-[21px]" />
        Processing
      </span>
    );
  }
  if (referral.txid) {
    const href = txUrl(referral.txid);
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-prism-meta sm:justify-end">
        <span className="inline-flex items-center gap-1.5 text-prism-ink-2">
          <CheckCircle2 aria-hidden className="h-[21px] w-[21px] text-prism-success" />
          Claimed
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="prism-focus inline-flex min-h-touch items-center rounded-prism-5 font-semibold tabular-nums text-prism-nav hover:underline"
          >
            {shortTx(referral.txid)}
            <span className="sr-only"> (transaction, opens in a new tab)</span>
          </a>
        )}
      </span>
    );
  }
  if (!referral.walletsLinked) {
    return (
      <span className="max-w-[260px] text-prism-meta text-prism-ink-2 sm:text-right">
        {walletsLine(referral.handle, referral.name)}
      </span>
    );
  }
  if (!available) {
    return <span className="text-prism-meta text-prism-ink-2 sm:text-right">{UNAVAILABLE}</span>;
  }
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={claiming}
      aria-busy={claiming}
      onClick={onClaim}
    >
      {claiming && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
      {claiming ? "Claiming" : "Claim reward"}
    </Button>
  );
}

/**
 * Screen Review 060: the Invite card in Get tREVO. The link is always visible
 * with Copy link; who joined sits behind one disclosure row. Reward and Claim
 * wording is kept (D1). Queries read the signed in account, so the card is the
 * same when the live wallet has not reconnected.
 */
export default function InviteCard() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [target, setTarget] = useState<(ClaimTarget & { referralId: number }) | null>(null);

  const pages = useQueries({
    queries: Array.from({ length: pageCount }, (_, index) => ({
      ...trpc.referral.myReferrals.queryOptions({ page: index + 1, limit: PAGE_SIZE }),
      enabled: !!authUser,
    })),
  });
  const first = pages[0];
  const isError = pages.some(page => page.isError);
  const showSkeleton = useDelayed(!!first?.isPending, 400);
  const referrals = pages.flatMap(page => page.data?.referrals ?? []);
  const total = first?.data?.total ?? 0;
  const totalPages = first?.data?.totalPages ?? 1;
  const available = first?.data?.affiliateWalletBalance?.hasBalance !== false;
  const loadingMore = pages.length > 1 && pages[pages.length - 1]?.isPending;

  const claim = useMutation({
    mutationFn: (referralId: number) =>
      trpcClient.referral.claimReferralReward.mutate({ referralId }),
    onSuccess: async data => {
      setTarget(null);
      const href = txUrl(data.txid);
      toast.add({
        type: "success",
        title: "Reward claimed",
        actionProps: href
          ? { children: "View", onClick: () => window.open(href, "_blank", "noopener") }
          : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.referral.myReferrals.pathKey() });
    },
  });

  if (!authUser) return null;

  const userIdHex = `0x${authUser.id.toString(16)}`;
  const link = `${import.meta.env.VITE_LANDINGPAGE_URL}/register?r=${userIdHex}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyFailed(false);
      setCopied(true);
      toast.add({ type: "success", title: "Link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      inputRef.current?.select();
    }
  };

  const copyButton = (wide: boolean) => (
    <Button
      type="button"
      variant="secondary"
      onClick={() => void copy()}
      className={cn(wide && "h-commit w-full")}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );

  const openClaim = (referral: Referral) => {
    claim.reset();
    setTarget({
      referralId: referral.referralId,
      title: `${referral.name} joined`,
      byline: (
        <>
          {referral.handle ? `@${referral.handle}` : null}
          {referral.handle ? " · " : null}
          Joined {formatJoined(referral.joinedAt)}
        </>
      ),
      art: <Avatar name={referral.name} imageUrl={referral.imageUrl} className="h-full w-full" />,
      amount: first?.data?.referrerReward ?? 0,
      forLabel: referral.handle ? `${referral.name}, @${referral.handle}` : referral.name,
    });
  };

  let list: React.ReactNode;
  if (isError) {
    list = (
      <ErrorCard
        title="Referrals did not load"
        cause="The referral list is not reachable right now."
        onRetry={() => pages.forEach(page => page.isError && void page.refetch())}
        retryLabel="Retry"
        className="!shadow-none"
      />
    );
  } else if (first?.isPending) {
    list = showSkeleton ? (
      <ul aria-busy aria-label="Loading referrals">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </ul>
    ) : (
      <div className="h-[165px]" aria-hidden />
    );
  } else if (referrals.length === 0) {
    list = (
      <EmptyState
        icon={Users}
        title="No referrals yet"
        description="Share your link to invite creators."
        action={copyButton(false)}
      />
    );
  } else {
    list = (
      <>
        <ul aria-label="Your referrals">
          {referrals.map(referral => (
            <li
              key={referral.referralId}
              className="flex min-h-commit flex-wrap items-center gap-x-3 gap-y-1 border-b border-prism-line py-2 last:border-b-0"
            >
              <Avatar name={referral.name} imageUrl={referral.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-prism-label font-semibold text-prism-ink">
                  {referral.name}
                </p>
                <p className="flex flex-wrap items-center gap-x-1 text-prism-meta text-prism-ink-2">
                  {referral.handle && (
                    <a
                      href={profileUrl(referral.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="prism-focus -my-3 inline-flex min-h-touch items-center rounded-prism-5 font-semibold text-prism-nav hover:underline"
                    >
                      @{referral.handle}
                    </a>
                  )}
                  <span className="whitespace-nowrap">
                    {referral.handle ? "· " : ""}Joined {formatJoined(referral.joinedAt)}
                  </span>
                </p>
              </div>
              {/* At 390 the status sits under the name, as on the mobile board */}
              <div className="flex basis-full pl-[46px] sm:basis-auto sm:justify-end sm:pl-0">
                <ReferralStatus
                  referral={referral}
                  available={available}
                  claiming={claim.isPending && claim.variables === referral.referralId}
                  onClaim={() => openClaim(referral)}
                />
              </div>
            </li>
          ))}
        </ul>
        {pageCount < totalPages && (
          <div className="flex justify-center pt-3">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={() => setPageCount(count => count + 1)}
            >
              {loadingMore && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
              Show more
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="invite-title"
      className="prism-glass-clear flex flex-col !rounded-prism-21 p-[21px] font-prism sm:p-[34px]"
    >
      <h3 id="invite-title" className="text-prism-panel-title text-prism-ink">
        Invite creators
      </h3>
      {/* D1: Reward and Claim wording kept, as Rob decided */}
      <p className="mt-2 text-prism-body text-prism-ink-2">
        Share your link. When a creator signs up with it, you can each claim a referral reward.
      </p>
      <Button asChild variant="ghost" className="-ml-3 mt-1 self-start">
        <a href={REFERRALS_ARTICLE} target="_blank" rel="noopener noreferrer">
          How referrals work
          <ExternalLink aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>

      <label
        htmlFor={`${listId}-link`}
        className="mt-5 text-prism-label font-semibold text-prism-ink"
      >
        Your invite link
      </label>
      <div className="prism-well mt-2 flex h-touch items-center px-3">
        <input
          id={`${listId}-link`}
          ref={inputRef}
          readOnly
          value={link}
          onFocus={event => event.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent text-prism-label text-prism-ink focus:outline-none"
        />
      </div>
      <div className="mt-3" aria-live="polite">
        {copyButton(true)}
      </div>
      {copyFailed && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-prism-meta text-prism-danger">
          <AlertCircle aria-hidden className="mt-px h-4 w-4 shrink-0" />
          Copy failed. Select the link and copy it manually.
        </p>
      )}

      <div className="mt-3 text-prism-meta tabular-nums text-prism-ink-2">
        {/* A failed query never reads as zero referrals */}
        {!isError && first?.data && (
          <p>
            <span className="font-bold text-prism-ink">{total}</span>{" "}
            {total === 1 ? "creator joined" : "creators joined"}
          </p>
        )}
        <p>Referral ID {userIdHex}</p>
      </div>

      <div className="mt-4 border-t border-prism-line">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(value => !value)}
          className="prism-focus flex min-h-commit w-full items-center gap-3 rounded-prism-8 text-left"
        >
          <span className="flex-1 text-prism-label font-semibold text-prism-ink">
            Your referrals
          </span>
          {!isError && first?.data && (
            <span className="text-prism-meta tabular-nums text-prism-ink-2">{total}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-[21px] w-[21px] shrink-0 text-prism-ink-2 transition-transform duration-prism-control motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
        {open && (
          <div id={listId} className="border-t border-prism-line pb-2 pt-1">
            {list}
          </div>
        )}
      </div>

      <div className="mt-5">
        <TestnetLine />
      </div>

      <ClaimReviewPanel
        target={target}
        onOpenChange={next => {
          if (!next) setTarget(null);
        }}
        onClaim={() => target && claim.mutate(target.referralId)}
        claiming={claim.isPending}
        failed={claim.isError}
      />
    </section>
  );
}
