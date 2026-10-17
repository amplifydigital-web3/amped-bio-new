import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Loader2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { COINBASE_TERMS, ONRAMP_COPY, ONRAMP_LIMITS, type OnrampStatus } from "@repo/constants";
import { USDC_SYMBOL, formatUsdc } from "@repo/web3";
import {
  AmountPresets,
  AmountWell,
  Button,
  ErrorCard,
  Notice,
  SidePanel,
  StepBar,
  trpc,
} from "@repo/ui";
import CoinbaseIcon from "@/assets/icons/coinbase.png";
import { useWalletContext } from "@/contexts/WalletContext";
import { paymentChain } from "@/utils/paymentChain";
import { Slab, SlabRow } from "../../explore/pool-panel/sections";
import ReceiveDialog from "../dialogs/ReceiveDialog";
import { countryName, regionLabel, stateName } from "./regions";

type Phase = "amount" | "pay" | "handoff";
type Region = { country: string; subdivision: string | null };

// o1 to o6: Amount, Choose how to pay, then Coinbase and the result
const STEPS = ["Amount", "How to pay", "Coinbase"];
const OPEN: OnrampStatus[] = ["created", "pending_verification", "pending_payment", "processing"];
const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 30_000;
const FAST_FOR_MS = 10 * 60_000;
const STOP_AFTER_MS = 2 * 60 * 60_000;
// Quote refresh (o1): every 30 seconds while the Amount step is open, for five minutes
const QUOTE_REFRESH_MS = 30_000;
const QUOTE_REFRESH_FOR_MS = 5 * 60_000;

function serverMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string } | null)?.message;
  return message && message.length < 160 ? message : fallback;
}

function money(amount: string | null | undefined, currency: string) {
  if (!amount) return "None";
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return value.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function usdcFromDecimal(amount: string | null | undefined) {
  if (!amount) return null;
  const value = Number(amount);
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : amount;
}

function usdcFromUnits(units: string | null | undefined) {
  if (!units) return null;
  try {
    return formatUsdc(BigInt(units), 4);
  } catch {
    return null;
  }
}

/** In app paths only; anything else is dropped. */
function safeReturn(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/**
 * Screen Review 138, boards o1, o2, o4, o5, o6 and o7 (spec 3.7). Buy USDC
 * through Coinbase at /wallet?fund=usdc. Coinbase is the seller: the Amount
 * step shows Coinbase's quote, Choose how to pay hands the fan to Coinbase in
 * a new tab, and the panel waits for Coinbase and then for Base. Arrived shows
 * only once the USDC is on chain in the fan's wallet. Nothing is charged on
 * Amped.Bio. USDC-4 ships the Coinbase account path; Apple Pay and Google Pay
 * follow in USDC-5.
 */
export default function BuyUsdcFlow() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wallet = useWalletContext();
  const open = params.get("fund") === "usdc";
  const sessionParam = params.get("session");
  const returnTo = safeReturn(params.get("return"));

  const [phase, setPhase] = useState<Phase>(sessionParam ? "handoff" : "amount");
  const [amount, setAmount] = useState("25");
  const [region, setRegion] = useState<Region | null>(null);
  const [editingRegion, setEditingRegion] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [handoffAt, setHandoffAt] = useState(() => Date.now());
  const [cause, setCause] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [quoteStartedAt, setQuoteStartedAt] = useState(() => Date.now());
  const amountRef = useRef(amount);
  amountRef.current = amount;

  // The redirect back from Coinbase opens the panel on its session
  useEffect(() => {
    if (open && sessionParam && sessionParam !== sessionId) {
      setSessionId(sessionParam);
      setPhase("handoff");
      setHandoffAt(Date.now());
    }
  }, [open, sessionParam, sessionId]);

  const options = useQuery({
    ...trpc.onramp.options.queryOptions(region ? { region } : undefined),
    enabled: open,
    staleTime: 10 * 60_000,
  });
  const effectiveRegion = region ?? options.data?.region ?? null;
  const path = options.data?.paths.coinbase_account;
  const currency = options.data?.fiatCurrency ?? "USD";

  // 064 I06: one amount error, named by the fix
  const amountError = useMemo(() => {
    const text = amount.trim();
    if (!text) return undefined;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return "Use numbers with up to 2 decimals.";
    const cents = Math.round(Number(text) * 100);
    if (!path) return undefined;
    if (cents < path.minCents) return `Minimum ${(path.minCents / 100).toFixed(2)} ${currency}.`;
    if (cents > path.maxCents) return `Maximum ${(path.maxCents / 100).toFixed(2)} ${currency}.`;
    return undefined;
  }, [amount, path, currency]);

  // Debounced 400 ms (spec 3.7 step 1)
  const [quotedAmount, setQuotedAmount] = useState(amount);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuotedAmount(amount.trim());
      setQuoteStartedAt(Date.now());
    }, 400);
    return () => clearTimeout(timer);
  }, [amount]);

  const canQuote =
    open &&
    phase === "amount" &&
    !!effectiveRegion &&
    !!options.data &&
    !options.data.needsRegion &&
    options.data.regionSupported &&
    !!path?.available &&
    !!quotedAmount &&
    !amountError &&
    quotedAmount === amount.trim();

  const quote = useQuery({
    ...trpc.onramp.quote.queryOptions({
      amount: quotedAmount || "0",
      mode: "coinbase_account",
      region: effectiveRegion ?? { country: "US", subdivision: null },
    }),
    enabled: canQuote,
    staleTime: QUOTE_REFRESH_MS,
    retry: false,
    refetchInterval: () =>
      Date.now() - quoteStartedAt < QUOTE_REFRESH_FOR_MS ? QUOTE_REFRESH_MS : false,
  });
  const quoteStale = Date.now() - quoteStartedAt >= QUOTE_REFRESH_FOR_MS;

  const createSession = useMutation(trpc.onramp.createSession.mutationOptions());
  const cancel = useMutation(trpc.onramp.cancel.mutationOptions());

  const status = useQuery({
    ...trpc.onramp.status.queryOptions({ sessionId: sessionId ?? "" }),
    enabled: open && phase === "handoff" && !!sessionId,
    refetchInterval: query => {
      const current = query.state.data;
      if (
        current &&
        !OPEN.includes(current.status) &&
        (current.status !== "success" || current.chainConfirmed)
      ) {
        return false;
      }
      const elapsed = Date.now() - handoffAt;
      if (elapsed > STOP_AFTER_MS) return false;
      return elapsed < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    },
  });
  const session = status.data;
  const arrived = session?.status === "success" && session.chainConfirmed;
  const notCompleted = session?.status === "failed" || session?.status === "expired";
  const slow = !arrived && !notCompleted && Date.now() - handoffAt > STOP_AFTER_MS;

  // Arrival updates the tile and Activity without a reload (o5)
  useEffect(() => {
    if (arrived) {
      void queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      void queryClient.invalidateQueries({ queryKey: trpc.usdc.activity.queryKey() });
    }
  }, [arrived, queryClient]);

  // A cancel on our side, or a session canceled in another tab, returns to Amount
  useEffect(() => {
    if (session?.status === "canceled" && phase === "handoff") {
      setPhase("amount");
      setSessionId(null);
    }
  }, [session?.status, phase]);

  const reset = () => {
    setPhase("amount");
    setSessionId(null);
    setCause("");
    setEditingRegion(false);
    createSession.reset();
    cancel.reset();
  };

  const close = () => {
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("fund");
        next.delete("session");
        next.delete("return");
        return next;
      },
      { replace: true }
    );
    reset();
  };

  /**
   * Opens Coinbase in a new tab (never an iframe; the hosted page forbids it).
   * The tab opens on the tap so the browser allows it, then gets the single
   * use URL once the server has made it.
   */
  const openCoinbase = async () => {
    if (!effectiveRegion) return;
    setCause("");
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const result = await createSession.mutateAsync({
        amount: amountRef.current.trim(),
        region: effectiveRegion,
        returnTo: returnTo ?? undefined,
      });
      if (tab) tab.location.href = result.onrampUrl;
      else window.open(result.onrampUrl, "_blank", "noopener,noreferrer");
      setSessionId(result.sessionId);
      setHandoffAt(Date.now());
      setPhase("handoff");
      setParams(
        current => {
          const next = new URLSearchParams(current);
          next.set("session", result.sessionId);
          return next;
        },
        { replace: true }
      );
    } catch (error) {
      tab?.close();
      setCause(serverMessage(error, "Coinbase did not open. Nothing was charged."));
    }
  };

  const cancelPurchase = async () => {
    if (sessionId) await cancel.mutateAsync({ sessionId }).catch(() => undefined);
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("session");
        return next;
      },
      { replace: true }
    );
    reset();
  };

  const tryAgain = () => {
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("session");
        return next;
      },
      { replace: true }
    );
    reset();
  };

  const stepIndex = phase === "amount" ? 0 : phase === "pay" ? 1 : arrived ? 3 : 2;
  const quoteView = phase === "handoff" ? session?.quote : quote.data?.quote;

  const quoteSlab = quoteView ? (
    <Slab>
      <SlabRow label="You pay" value={money(quoteView.paymentTotal, quoteView.paymentCurrency)} />
      <SlabRow
        label="Coinbase fee"
        value={money(quoteView.coinbaseFee, quoteView.paymentCurrency)}
      />
      <SlabRow label="Network fee" value={money(quoteView.networkFee, quoteView.paymentCurrency)} />
      <SlabRow
        label="You receive"
        value={`About ${usdcFromDecimal(quoteView.purchaseAmount)} ${USDC_SYMBOL}`}
      />
      <SlabRow label="Delivered to" value={`Your wallet on ${paymentChain.name}`} />
    </Slab>
  ) : null;

  const coinbaseLine = (
    <p className="flex items-start gap-2 font-prism text-prism-meta text-prism-ink-2">
      <img src={CoinbaseIcon} alt="" aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{ONRAMP_COPY.quoteLine}</span>
    </p>
  );

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (!wallet.address) {
    body = <Notice variant="info" title="Connect your wallet to buy USDC." />;
  } else if (options.isPending) {
    body = (
      <div className="flex items-center gap-3 py-6 text-prism-label text-prism-ink-2" aria-busy>
        <Loader2 aria-hidden className="h-[21px] w-[21px] motion-safe:animate-spin" />
        Checking what Coinbase offers in your region
      </div>
    );
  } else if (options.isError) {
    body = (
      <ErrorCard
        title="Buy USDC did not load"
        cause={serverMessage(options.error, "Coinbase did not answer. Try again in a moment.")}
        onRetry={() => void options.refetch()}
        retryLabel="Retry"
      />
    );
  } else if (phase === "handoff") {
    // o4, o5, o6 and the waiting state
    if (status.isPending) {
      body = (
        <div className="flex items-center gap-3 py-6 text-prism-label text-prism-ink-2" aria-busy>
          <Loader2 aria-hidden className="h-[21px] w-[21px] motion-safe:animate-spin" />
          Checking with Coinbase
        </div>
      );
    } else if (status.isError || !session) {
      body = (
        <ErrorCard
          title="This purchase did not load"
          cause={serverMessage(status.error, "Try again in a moment.")}
          onRetry={() => void status.refetch()}
          retryLabel="Retry"
        />
      );
      footer = (
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
          Done
        </Button>
      );
    } else if (arrived) {
      const received =
        usdcFromUnits(session.usdcAmount) ?? usdcFromDecimal(session.quote?.purchaseAmount);
      const explorer = paymentChain.blockExplorers?.default.url;
      body = (
        <div className="space-y-[21px]" aria-live="polite">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="prism-disc" aria-hidden>
              <CheckCircle2 className="h-[34px] w-[34px] text-prism-success" strokeWidth={1.5} />
            </span>
            <h3 className="text-prism-panel-title text-prism-ink">
              {received ? ONRAMP_COPY.arrived(received) : "Your USDC is in your wallet."}
            </h3>
            <p className="text-prism-body text-prism-ink-2">On {paymentChain.name}</p>
          </div>
          <Slab>
            <SlabRow
              label="You paid Coinbase"
              value={money(session.quote?.paymentTotal ?? session.fiatAmount, session.fiatCurrency)}
            />
            <SlabRow label="Method" value="Your Coinbase account" />
            {session.orderRef && <SlabRow label="Order" value={session.orderRef} />}
          </Slab>
          {session.txHash && explorer && !session.sandbox && (
            <Button asChild variant="ghost" className="-ml-3">
              <a
                href={`${explorer}/tx/${session.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on explorer
                <ExternalLink aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          )}
          <p className="font-prism text-prism-meta text-prism-ink-2">
            {session.sandbox
              ? "Coinbase sandbox purchase: nothing was charged and nothing was delivered on chain."
              : "Your balance updated without a reload. A Coinbase receipt is in your email."}
          </p>
        </div>
      );
      footer = (
        <div className="flex flex-col gap-2">
          {session.returnTo && (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                const target = session.returnTo!;
                close();
                navigate(target);
              }}
            >
              Back to the item
              <ArrowRight aria-hidden />
            </Button>
          )}
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      );
    } else if (notCompleted) {
      body = (
        <div className="space-y-[21px]" aria-live="polite">
          <Notice variant="warning" title={ONRAMP_COPY.notCompleted} />
          <Slab>
            <SlabRow
              label="Coinbase said"
              value={
                session.status === "expired"
                  ? "The purchase was not finished in time"
                  : session.failureCode
                    ? session.failureCode.replace(/_/g, " ")
                    : "The purchase did not complete"
              }
            />
            {session.orderRef && <SlabRow label="Order" value={session.orderRef} />}
          </Slab>
        </div>
      );
      footer = (
        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={tryAgain}>
            Try again
          </Button>
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      );
    } else {
      const sending = session.status === "processing" || session.status === "success";
      body = (
        <div className="space-y-[21px]">
          <div className="flex flex-col items-center gap-2 py-2 text-center" aria-live="polite">
            <span className="prism-disc" aria-hidden>
              <Loader2
                className="h-[34px] w-[34px] text-prism-value-ink motion-safe:animate-spin"
                strokeWidth={1.5}
              />
            </span>
            <h3 className="text-prism-panel-title text-prism-ink">
              {session.status === "success"
                ? `Confirming on ${paymentChain.name}`
                : sending
                  ? "Coinbase is sending your USDC"
                  : "Waiting for Coinbase"}
            </h3>
            <p className="text-prism-body text-prism-ink-2">
              {slow
                ? ONRAMP_COPY.slow
                : sending
                  ? "It shows in your wallet as soon as Base confirms it."
                  : ONRAMP_COPY.coinbaseAccount.waiting}
            </p>
          </div>
          {quoteSlab}
          {!sending && (
            <p className="font-prism text-prism-meta text-prism-ink-2">
              {ONRAMP_COPY.coinbaseAccount.linkLine}
            </p>
          )}
          {cause && <Notice variant="warning" title={cause} />}
        </div>
      );
      footer = !sending ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={createSession.isPending}
            aria-busy={createSession.isPending || undefined}
            onClick={() => void openCoinbase()}
          >
            {createSession.isPending ? (
              <Loader2 aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <ExternalLink aria-hidden />
            )}
            Open Coinbase again
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={cancel.isPending}
            onClick={() => void cancelPurchase()}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
          Close, keep going in the background
        </Button>
      );
    }
  } else if (options.data && !options.data.regionSupported && !editingRegion) {
    // o6 region variant: Try again becomes Deposit USDC
    body = (
      <div className="space-y-[21px]">
        <Notice variant="warning" title={ONRAMP_COPY.region} />
        {effectiveRegion && (
          <Slab>
            <SlabRow
              label="Region"
              value={
                <span className="flex items-center justify-end gap-1">
                  {regionLabel(effectiveRegion)}
                  <Button type="button" variant="ghost" onClick={() => setEditingRegion(true)}>
                    Change
                  </Button>
                </span>
              }
            />
          </Slab>
        )}
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" className="w-full" onClick={() => setDepositOpen(true)}>
          Deposit {USDC_SYMBOL}
        </Button>
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
          Done
        </Button>
      </div>
    );
  } else if (options.data && (options.data.needsRegion || editingRegion)) {
    body = (
      <RegionPicker
        countries={options.data.countries}
        initial={effectiveRegion}
        onPick={next => {
          setRegion(next);
          setEditingRegion(false);
        }}
        onCancel={
          effectiveRegion && !options.data.needsRegion ? () => setEditingRegion(false) : undefined
        }
      />
    );
  } else if (phase === "amount" && options.data && effectiveRegion) {
    // o1 and o7
    body = (
      <>
        <AmountWell
          label="Amount"
          value={amount}
          onChange={setAmount}
          unit={currency}
          available={
            path ? (
              <>
                Minimum{" "}
                <span className="font-semibold">
                  {(path.minCents / 100).toFixed(2)} {currency}
                </span>
              </>
            ) : undefined
          }
          error={amountError}
        />
        <AmountPresets
          presets={ONRAMP_LIMITS.presets.map(value => ({ label: value, value }))}
          onPick={setAmount}
        />
        {quote.isError ? (
          <ErrorCard
            title="Coinbase did not return a price"
            cause={serverMessage(quote.error, "Try again in a moment.")}
            onRetry={() => void quote.refetch()}
            retryLabel="Retry"
          />
        ) : quote.isFetching && !quote.data ? (
          <div
            className="prism-slab flex min-h-commit items-center gap-3 !rounded-prism-21 px-4"
            aria-busy
          >
            <Loader2
              aria-hidden
              className="h-[21px] w-[21px] text-prism-nav motion-safe:animate-spin"
            />
            <span className="text-prism-label text-prism-ink-2">Getting Coinbase's price</span>
          </div>
        ) : (
          quoteSlab
        )}
        {coinbaseLine}
        <div className="flex flex-wrap items-center justify-between gap-2 font-prism text-prism-meta text-prism-ink-2">
          <span className="flex items-center gap-1">
            <MapPin aria-hidden className="h-4 w-4" />
            Buying in {regionLabel(effectiveRegion)}
          </span>
          <Button type="button" variant="ghost" onClick={() => setEditingRegion(true)}>
            Change region
          </Button>
        </div>
        {quoteStale && quote.data && (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 self-start"
            onClick={() => {
              setQuoteStartedAt(Date.now());
              void quote.refetch();
            }}
          >
            <RefreshCw aria-hidden />
            Refresh price
          </Button>
        )}
      </>
    );
    footer = (
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!quote.data || !!amountError || quote.isFetching}
        onClick={() => setPhase("pay")}
      >
        Choose how to pay
        <ArrowRight aria-hidden />
      </Button>
    );
  } else if (phase === "pay" && options.data && effectiveRegion) {
    // o2. Apple Pay and Google Pay join this list in USDC-5.
    const us = effectiveRegion.country === "US";
    body = (
      <>
        {quoteSlab}
        <fieldset className="space-y-[13px]">
          <legend className="sr-only">How to pay Coinbase</legend>
          <button
            type="button"
            disabled={!path?.available || createSession.isPending}
            onClick={() => void openCoinbase()}
            className="prism-lens flex w-full items-start gap-3 !rounded-prism-21 p-4 text-left font-prism disabled:opacity-60"
          >
            <span className="prism-glass-clear flex h-[44px] w-[44px] shrink-0 items-center justify-center !rounded-prism-13">
              <img src={CoinbaseIcon} alt="" aria-hidden className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-prism-label font-semibold text-prism-ink">
                {ONRAMP_COPY.coinbaseAccount.title}
              </span>
              <span className="block text-prism-meta text-prism-ink-2">
                {us ? ONRAMP_COPY.coinbaseAccount.usBody : ONRAMP_COPY.coinbaseAccount.intlBody}
              </span>
              {!path?.available && path?.reason && (
                <span className="block text-prism-meta text-prism-ink-2">{path.reason}</span>
              )}
            </span>
            {createSession.isPending ? (
              <Loader2
                aria-hidden
                className="mt-3 h-5 w-5 text-prism-nav motion-safe:animate-spin"
              />
            ) : (
              <Landmark aria-hidden className="mt-3 h-5 w-5 text-prism-ink-2" />
            )}
          </button>
        </fieldset>
        {cause && <Notice variant="warning" title={cause} />}
        <p className="font-prism text-prism-meta text-prism-ink-2">
          By continuing you agree to Coinbase's{" "}
          <a
            className="underline"
            href={COINBASE_TERMS.guestCheckout}
            target="_blank"
            rel="noopener noreferrer"
          >
            Guest Checkout Terms
          </a>
          ,{" "}
          <a
            className="underline"
            href={COINBASE_TERMS.userAgreement}
            target="_blank"
            rel="noopener noreferrer"
          >
            User Agreement
          </a>{" "}
          and{" "}
          <a
            className="underline"
            href={COINBASE_TERMS.privacy}
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      </>
    );
    footer = (
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={createSession.isPending}
        onClick={() => setPhase("amount")}
      >
        Back
      </Button>
    );
  }

  return (
    <>
      <SidePanel
        open={open}
        onOpenChange={next => {
          if (!next) close();
        }}
        calm={phase === "handoff"}
        eyebrow={`Buy ${USDC_SYMBOL}`}
        title={`${USDC_SYMBOL} on ${paymentChain.name}`}
        byline={ONRAMP_COPY.byline}
        art={
          <span className="flex h-full w-full items-center justify-center bg-prism-value-panel-2">
            <img src={CoinbaseIcon} alt="" aria-hidden className="h-[34px] w-[34px]" />
          </span>
        }
        footer={footer}
      >
        <StepBar steps={STEPS} current={stepIndex} />
        {body}
      </SidePanel>
      <ReceiveDialog open={depositOpen} onOpenChange={setDepositOpen} network="payment" />
    </>
  );
}

function RegionPicker({
  countries,
  initial,
  onPick,
  onCancel,
}: {
  countries: { id: string; subdivisions: string[] }[];
  initial: Region | null;
  onPick: (region: Region) => void;
  onCancel?: () => void;
}) {
  const sorted = useMemo(
    () => [...countries].sort((a, b) => countryName(a.id).localeCompare(countryName(b.id))),
    [countries]
  );
  const [country, setCountry] = useState(initial?.country ?? "US");
  const [state, setState] = useState(initial?.subdivision ?? "");
  const states = countries.find(entry => entry.id === country)?.subdivisions ?? [];
  const needsState = country === "US";
  const ready = !!country && (!needsState || !!state);
  const fieldClass =
    "prism-slab h-touch w-full !rounded-prism-13 px-3 font-prism text-prism-label text-prism-ink";

  return (
    <div className="space-y-[13px] font-prism">
      <p className="text-prism-body text-prism-ink-2">
        Coinbase's prices and ways to pay depend on where you live.
      </p>
      <label className="block space-y-1">
        <span className="text-prism-label font-bold text-prism-ink">Country</span>
        <select
          className={fieldClass}
          value={country}
          onChange={event => {
            setCountry(event.target.value);
            setState("");
          }}
        >
          {sorted.map(entry => (
            <option key={entry.id} value={entry.id}>
              {countryName(entry.id)}
            </option>
          ))}
        </select>
      </label>
      {needsState && (
        <label className="block space-y-1">
          <span className="text-prism-label font-bold text-prism-ink">State</span>
          <select
            className={fieldClass}
            value={state}
            onChange={event => setState(event.target.value)}
          >
            <option value="">Choose your state</option>
            {[...states]
              .sort((a, b) => stateName(a).localeCompare(stateName(b)))
              .map(code => (
                <option key={code} value={code}>
                  {stateName(code)}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!ready}
          onClick={() => onPick({ country, subdivision: needsState ? state : null })}
        >
          Use this region
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
