import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CHECKOUT_COPY, checkoutIntentIdSchema, formatBps, usdcDollars } from "@repo/constants";
import { trpc, useAuth } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useUsdcBalance } from "@/components/panels/wallet/hooks/useUsdcBalance";
import { USDC_FLAGS } from "@/config/usdc/flags";
import { paymentChain } from "@/utils/paymentChain";
import { CHECKOUT_ON } from "@/components/shell/CheckoutResumeBar";
import { createMockProvider, type CheckoutQuote } from "@/components/checkout/provider";
import {
  Amount,
  FigureRow,
  Figures,
  SheetButton,
  SheetFrame,
  SheetMessage,
} from "@/components/checkout/PaySheet";

/**
 * app.amped.bio/pay/{intent} (docs/features/mobile-checkout.md 5 to 10, PR CK-2).
 * One screen to pay a fixed amount, on the mock provider until CK-5.
 */

const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio";
const ON_TESTNET = paymentChain.testnet === true;

type Phase = "sheet" | "checking" | "paid" | "failed";

const lastSeenKey = (id: string) => `amped:checkout-seen:${id}`;
const explainerKey = (userId: number) => `amped:usdc-explainer:${userId}`;

function readStorage(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // Storage can be blocked; the sheet still works, it only forgets
  }
}

/** What the fan last saw for this intent, so a changed price or fee shows before Pay. */
function seenSignature(quote: CheckoutQuote) {
  return `${quote.amount}:${quote.feeBps}`;
}

export function PayPage() {
  const { intentId = "" } = useParams();
  const validId = checkoutIntentIdSchema.safeParse(intentId).success;
  const { authUser } = useAuth();
  const { address } = useWalletContext();
  const provider = useMemo(() => createMockProvider(), []);
  const [phase, setPhase] = useState<Phase>("sheet");
  const [acceptedSignature, setAcceptedSignature] = useState<string | null>(null);
  // What the fan last saw for this intent; survives a reload or a Wallet round trip
  const [seen, setSeen] = useState(() => readStorage("session", lastSeenKey(intentId)));
  const [showExplainer] = useState(
    () => authUser !== null && readStorage("local", explainerKey(authUser.id)) === null
  );

  // Reading the intent claims it for this fan (CK-1)
  const intent = useQuery({
    ...trpc.checkout.get.queryOptions({ id: intentId }),
    enabled: CHECKOUT_ON && validId,
    retry: false,
  });
  const claimed = intent.isSuccess && intent.data.status !== "expired";

  // A fresh quote on every open and every return to the tab (spec 5)
  const quote = useQuery({
    queryKey: ["checkout-quote", intentId, provider.id],
    queryFn: () => provider.quote(intentId),
    enabled: claimed && intent.data?.status !== "paid",
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const balance = useUsdcBalance(address as `0x${string}` | undefined);

  useEffect(() => {
    if (authUser && showExplainer) writeStorage("local", explainerKey(authUser.id), "1");
  }, [authUser, showExplainer]);

  // The first quote the fan sees becomes "what they saw", unless QA seeds a price change
  useEffect(() => {
    if (!quote.data || quote.data.state !== "ready") return;
    if (seen !== null) return;
    const seeded = provider.seedLastSeen(quote.data);
    const value = seeded ? `${seeded}:${quote.data.feeBps}` : seenSignature(quote.data);
    writeStorage("session", lastSeenKey(intentId), value);
    setSeen(value);
  }, [quote.data, intentId, provider, seen]);

  // An 18+ item passes the Over 18 check first (spec 6, identity checks 4.2)
  useEffect(() => {
    if (quote.data?.item?.adult) {
      window.location.assign(`/age-check?returnTo=${encodeURIComponent(`/pay/${intentId}`)}`);
    }
  }, [quote.data?.item?.adult, intentId]);

  const creator = quote.data?.creator ?? null;
  const theme = creator?.theme ?? null;
  const pageHref = creator ? `${LANDING}/${creator.handle}` : LANDING;
  const notes = (
    <>
      {ON_TESTNET && (
        <p className="text-center text-[13px] leading-[18px] opacity-80">{CHECKOUT_COPY.staging}</p>
      )}
      {provider.id === "mock" && (
        <p className="text-center text-[13px] leading-[18px] opacity-80">{CHECKOUT_COPY.mock}</p>
      )}
    </>
  );

  if (!CHECKOUT_ON || !validId || intent.isError || intent.data?.status === "expired") {
    return (
      <SheetFrame creator={null} closeHref={LANDING} notes={notes}>
        <SheetMessage tone="error" title={CHECKOUT_COPY.ended} />
      </SheetFrame>
    );
  }

  if (intent.isPending || (quote.isPending && intent.data?.status !== "paid")) {
    return (
      <SheetFrame creator={creator} closeHref={pageHref}>
        <SheetMessage tone="busy" title="Opening checkout" />
      </SheetFrame>
    );
  }

  if (quote.isError) {
    return (
      <SheetFrame creator={null} closeHref={LANDING} notes={notes}>
        <SheetMessage tone="error" title={quote.error.message || CHECKOUT_COPY.ended} />
      </SheetFrame>
    );
  }

  const q = quote.data;
  const item = q?.item;

  if (intent.data?.status === "paid" || phase === "paid" || q?.state === "paid") {
    const itemHref = creator && item ? `${LANDING}/${creator.handle}/c/${item.publicId}` : pageHref;
    return (
      <SheetFrame
        creator={creator}
        closeHref={pageHref}
        notes={notes}
        footer={
          <SheetButton theme={theme} href={itemHref}>
            Open
          </SheetButton>
        }
      >
        <SheetMessage
          tone="done"
          title={creator && q ? CHECKOUT_COPY.paid(creator.handle, usdcDollars(q.amount)) : "Paid."}
        >
          {item && <p className="text-[15px] leading-5 opacity-80">{item.title}</p>}
        </SheetMessage>
      </SheetFrame>
    );
  }

  if (!q) return null;

  // Error states (spec 10): one message, one next step, the intent stays open
  const stateMessage =
    q.state === "paused"
      ? CHECKOUT_COPY.paused
      : q.state === "limit"
        ? CHECKOUT_COPY.limit
        : q.state === "seller" && creator
          ? CHECKOUT_COPY.seller(creator.handle)
          : q.state === "removed"
            ? CHECKOUT_COPY.removed
            : null;
  if (stateMessage) {
    return (
      <SheetFrame
        creator={creator}
        closeHref={pageHref}
        notes={notes}
        footer={
          q.state === "paused" ? (
            <SheetButton theme={theme} onClick={() => void quote.refetch()}>
              Try again
            </SheetButton>
          ) : (
            <SheetButton theme={theme} href={pageHref} variant="secondary">
              {q.state === "limit" ? "Close" : "Back to the page"}
            </SheetButton>
          )
        }
      >
        <SheetMessage tone="error" title={stateMessage} />
      </SheetFrame>
    );
  }

  if (phase === "checking") {
    return (
      <SheetFrame creator={creator} closeHref={pageHref} notes={notes}>
        <SheetMessage tone="busy" title={CHECKOUT_COPY.checking} />
      </SheetFrame>
    );
  }

  const amount = BigInt(q.amount);
  const override = provider.balanceOverride();
  const known = override ?? (USDC_FLAGS.wallet && balance.data !== undefined ? balance.data : null);
  const shortBy = known !== null && known < amount ? amount - known : 0n;

  // Price changed (spec 5, c7): the fresh quote differs from what the fan last saw
  const signature = seenSignature(q);
  const priceChanged = seen !== null && seen !== signature && acceptedSignature !== signature;
  const wasAmount = seen?.split(":")[0];

  const pay = async () => {
    setPhase("checking");
    const result = await provider.pay(intentId, q);
    setPhase(result.result === "paid" ? "paid" : "failed");
  };

  const acceptPrice = () => {
    writeStorage("session", lastSeenKey(intentId), signature);
    setSeen(signature);
    setAcceptedSignature(signature);
  };

  const footer =
    phase === "failed" ? (
      <SheetButton theme={theme} onClick={() => setPhase("sheet")}>
        Try again
      </SheetButton>
    ) : priceChanged ? (
      <>
        <SheetButton
          theme={theme}
          onClick={() => {
            acceptPrice();
            if (shortBy === 0n) void pay();
          }}
        >
          Pay {usdcDollars(q.amount)} USDC
        </SheetButton>
        <SheetButton theme={theme} href={pageHref} variant="secondary">
          Not now
        </SheetButton>
      </>
    ) : shortBy > 0n ? (
      <SheetButton theme={theme} href={`/wallet?fund=usdc&ci=${intentId}`}>
        {CHECKOUT_COPY.addUsdc}
      </SheetButton>
    ) : (
      <>
        <p className="text-center text-[13px] leading-[18px] opacity-80">
          {CHECKOUT_COPY.soldBy(creator?.name || (creator ? `@${creator.handle}` : "the creator"))}
        </p>
        <SheetButton theme={theme} onClick={() => void pay()}>
          Pay {usdcDollars(q.amount)} USDC
        </SheetButton>
      </>
    );

  return (
    <SheetFrame creator={creator} closeHref={pageHref} notes={notes} footer={footer}>
      {phase === "failed" && <SheetMessage tone="error" title={CHECKOUT_COPY.failed} />}
      {priceChanged && wasAmount && (
        <p
          role="alert"
          className="rounded-prism-13 border-2 border-current p-[13px] font-prism text-[15px] font-semibold leading-5 tabular-nums"
        >
          {CHECKOUT_COPY.priceChanged(usdcDollars(wasAmount), usdcDollars(q.amount))}
        </p>
      )}
      <div className="flex flex-col gap-1 pt-[13px]">
        <h1 className="text-[21px] font-bold leading-7">{item?.title}</h1>
        <p className="text-[15px] leading-5 opacity-80">Yours to keep</p>
      </div>
      <Figures>
        <FigureRow label="Amount" value={<Amount units={q.amount} />} />
        <FigureRow
          label={`${CHECKOUT_COPY.feeIncluded} (${formatBps(q.feeBps)})`}
          value={<Amount units={q.fee} />}
        />
        {known !== null && (
          <FigureRow
            label={shortBy > 0n ? "Your balance" : "Balance after"}
            value={<Amount units={shortBy > 0n ? known : known - amount} />}
          />
        )}
      </Figures>
      {shortBy > 0n && (
        <p role="status" className="font-prism text-[16px] font-semibold leading-6 tabular-nums">
          {CHECKOUT_COPY.short(usdcDollars(shortBy))}
        </p>
      )}
      {showExplainer && (
        <p className="text-[14px] leading-5 opacity-80">{CHECKOUT_COPY.explainer}</p>
      )}
    </SheetFrame>
  );
}
