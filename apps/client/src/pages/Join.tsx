/**
 * Join a membership (MB-2; mobile checkout 11, board c2). One screen: Every 30 days or Yearly,
 * the amount and the review line, the fee, the seller line with the store policy, the
 * required checkbox (unticked), then Join. The fan signs the join table and the USDC permit
 * in their wallet; the relayer sends it (MB-1). A lapsed seller shows "Not taking new members
 * right now" with no Join.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  CHECKOUT_COPY,
  MEMBERSHIP_ACCESS_STATUSES,
  MEMBERSHIP_COPY,
  PROMOTER_COPY,
  PLATFORM_FEE_BPS,
  usdcDollarsLabel,
  type MembershipInterval,
  type MembershipJoinPrepareResult,
} from "@repo/constants";
import { JOIN_TABLE_TYPES, USDC_PERMIT_TYPES } from "@repo/web3";
import {
  Button,
  Checkbox,
  ChipGroup,
  ErrorCard,
  Notice,
  Skeleton,
  trpc,
  trpcClient,
} from "@repo/ui";
import { usePaymentChainSigner } from "@/components/panels/wallet/send/useUsdcSigner";
import { classifyTxError } from "@/components/panels/explore/pool-panel/format";

const J = MEMBERSHIP_COPY.join;
const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio";

type Phase = "idle" | "preparing" | "signing" | "sending" | "done";

export function JoinPage() {
  const params = useParams();
  const handle = (params.handle ?? "").replace(/^@/, "").toLowerCase();
  // C12: the promoter code from the store link; a bad one simply attributes nothing
  const [search] = useSearchParams();
  const viaRaw = search.get("via")?.trim() ?? "";
  const via = /^[A-Za-z0-9_-]{1,32}$/.test(viaRaw) ? viaRaw : undefined;
  const navigate = useNavigate();
  const sign = usePaymentChainSigner();
  const { address } = useAccount();
  const plan = useQuery({ ...trpc.memberships.public.queryOptions({ handle }), retry: false });
  const [interval, setInterval] = useState<MembershipInterval>("every_30_days");
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [shortBy, setShortBy] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Extract<
    MembershipJoinPrepareResult,
    { refused: false }
  > | null>(null);

  useEffect(() => {
    if (plan.data && !plan.data.amountYearly) setInterval("every_30_days");
  }, [plan.data]);

  const amount = useMemo(() => {
    if (!plan.data) return null;
    return interval === "yearly" ? plan.data.amountYearly : plan.data.amountEvery30Days;
  }, [plan.data, interval]);

  const prepare = useMutation({
    mutationFn: () =>
      trpcClient.memberships.join.prepare.mutate({
        handle,
        interval,
        signer: address,
        ...(via ? { via } : {}),
      }),
  });

  const join = async () => {
    setError(null);
    setShortBy(null);
    setPhase("preparing");
    try {
      const result = await prepare.mutateAsync();
      if (result.refused) {
        if (result.reason === "insufficient_balance" && result.shortBy) setShortBy(result.shortBy);
        else if (result.reason === "seller" || result.reason === "not_found") setError(J.notTaking);
        else setError(MEMBERSHIP_COPY.refusals[result.reason]);
        setPhase("idle");
        return;
      }
      setPrepared(result);
      setPhase("signing");
      const j = result.typed.join;
      const p = result.typed.permit;
      const memberSignature = await sign({
        account: result.signer,
        domain: j.domain,
        types: JOIN_TABLE_TYPES,
        primaryType: "JoinTable",
        message: {
          ...j.message,
          price: BigInt(j.message.price),
          validBefore: BigInt(j.message.validBefore),
        },
      });
      const permitSignature = await sign({
        account: result.signer,
        domain: p.domain,
        types: USDC_PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: p.message.owner,
          spender: p.message.spender,
          value: BigInt(p.message.value),
          nonce: BigInt(p.message.nonce),
          deadline: BigInt(p.message.deadline),
        },
      });
      setPhase("sending");
      const sent = await trpcClient.memberships.join.submit.mutate({
        membershipId: result.membershipId,
        memberSignature,
        permitSignature,
      });
      if (sent.refused) {
        setError(MEMBERSHIP_COPY.refusals[sent.reason]);
        setPhase("idle");
        return;
      }
      if (sent.status === "active") {
        setPhase("done");
        return;
      }
      // Still landing: poll a few times
      let last: string = sent.status;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const status = await trpcClient.memberships.join.status.query({
          membershipId: result.membershipId,
        });
        last = status.status;
        if (status.status === "active") {
          setPhase("done");
          return;
        }
        if (status.status === "failed") break;
      }
      // A join still in flight may land: never tell the fan nothing was taken
      setError(last === "joining" ? J.pending : MEMBERSHIP_COPY.refusals.relayer);
      setPhase("idle");
    } catch (failure) {
      setError(
        classifyTxError(failure) === "rejected" ? J.rejected : MEMBERSHIP_COPY.refusals.relayer
      );
      setPhase("idle");
    }
  };

  let body: React.ReactNode;
  if (plan.isLoading) {
    body = (
      <div aria-busy aria-label="Loading" className="space-y-3">
        <Skeleton className="h-8 w-2/3 rounded-full" />
        <Skeleton className="h-[220px] w-full rounded-prism-21" />
      </div>
    );
  } else if (plan.isError) {
    body = <ErrorCard title={J.notFound} onRetry={() => void plan.refetch()} />;
  } else if (!plan.data) {
    // No active plan: paused, or the seller cannot take payments
    body = <Notice variant="info">{J.notTaking}</Notice>;
  } else if (phase === "done") {
    body = (
      <div className="space-y-[13px] text-center" role="status">
        <p className="text-prism-panel-title text-prism-ink">{J.done}</p>
        <Button size="lg" className="w-full" onClick={() => navigate(`/library/@${handle}`)}>
          {J.open}
        </Button>
      </div>
    );
  } else if (
    plan.data.viewer &&
    (MEMBERSHIP_ACCESS_STATUSES as readonly string[]).includes(plan.data.viewer.status) &&
    plan.data.viewer.accessUntil
  ) {
    body = (
      <div className="space-y-[13px]">
        <Notice variant="info">{J.member}</Notice>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => navigate(`/library/@${handle}`)}
        >
          {J.open}
        </Button>
      </div>
    );
  } else {
    const p = plan.data;
    const seller = prepared?.sellerName ?? p.sellerName;
    const label = amount ? usdcDollarsLabel(amount) : "";
    const busy = phase !== "idle";
    body = (
      <div className="space-y-[13px]">
        <div>
          <p className="text-prism-label font-semibold text-prism-ink">{p.name}</p>
          {p.benefits.length ? (
            <ul className="mt-1 list-disc pl-5 text-prism-meta text-prism-ink-2">
              {p.benefits.map(b => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {p.amountYearly ? (
          <ChipGroup
            label="Billing"
            value={interval}
            onChange={setInterval}
            options={[
              { value: "every_30_days", label: J.intervals.every_30_days },
              {
                value: "yearly",
                label: p.yearlySavingPercent
                  ? `${J.intervals.yearly}, save ${p.yearlySavingPercent}%`
                  : J.intervals.yearly,
              },
            ]}
          />
        ) : null}
        <div className="prism-value-panel rounded-prism-21 p-[21px]">
          <p className="font-prism text-[32px] font-bold tabular-nums text-prism-value-ink">
            {label}
          </p>
          <p className="text-prism-meta text-prism-value-ink/80">{J.review(label, interval)}</p>
          <p className="text-prism-meta text-prism-value-ink/80">{J.fee(PLATFORM_FEE_BPS / 100)}</p>
        </div>
        {shortBy ? (
          <Notice variant="warning">
            {J.short(usdcDollarsLabel(shortBy))}{" "}
            <a
              className="font-semibold underline"
              href={`/wallet?fund=usdc&need=${shortBy}&return=${encodeURIComponent(`/join/@${handle}`)}`}
            >
              {J.addUsdc}
            </a>
          </Notice>
        ) : null}
        {error ? <Notice variant="warning">{error}</Notice> : null}
        {prepared?.promoterHandle ? (
          <p className="text-prism-meta text-prism-ink-2">
            {PROMOTER_COPY.referredBy(prepared.promoterHandle)}
          </p>
        ) : null}
        <p className="text-prism-meta text-prism-ink-2">
          {CHECKOUT_COPY.soldBy(seller)}{" "}
          <a
            className="prism-focus inline-flex min-h-touch items-center font-semibold text-prism-nav underline"
            href={`${LANDING}/${p.handle}/store/policy${p.policyVersion ? `?v=${p.policyVersion}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {J.policy}
          </a>
        </p>
        <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
          <span className="text-prism-meta text-prism-ink">{J.consent(seller, interval)}</span>
        </Checkbox>
        <Button
          variant="commit"
          size="lg"
          className="w-full"
          disabled={!agreed || busy || !amount}
          onClick={() => void join()}
        >
          {phase === "signing"
            ? J.signing
            : phase === "sending" || phase === "preparing"
              ? J.sending
              : J.commit(label)}
        </Button>
        {prepared ? (
          <details className="text-prism-meta text-prism-ink-2">
            <summary className="min-h-touch cursor-pointer py-2 font-semibold">{J.details}</summary>
            <p>{J.allowance(usdcDollarsLabel(prepared.allowance))}</p>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <div className="prism-room flex min-h-dvh items-start justify-center px-4 py-[34px]">
      <main className="prism-glass-clear w-full max-w-[440px] space-y-[21px] !rounded-prism-34 p-[21px]">
        <h1 className="text-prism-panel-title text-prism-ink">{J.title(handle)}</h1>
        {body}
      </main>
    </div>
  );
}
