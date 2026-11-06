import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CHECKOUT_COPY,
  PROMOTER_COPY,
  SERVICE_CHECKOUT_COPY,
  STORE_COPY,
  checkoutIntentIdSchema,
  formatBps,
  usdcDollars,
  type PurchaseRefusal,
} from "@repo/constants";
import { BottomSheet, BottomSheetContent, queryClient, trpc, trpcClient, useAuth } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useUsdcBalance } from "@/components/panels/wallet/hooks/useUsdcBalance";
import { usePaymentChainSigner } from "@/components/panels/wallet/send/useUsdcSigner";
import { USDC_FLAGS } from "@/config/usdc/flags";
import { paymentChain } from "@/utils/paymentChain";
import { CHECKOUT_ON } from "@/components/shell/CheckoutResumeBar";
import { authbaseVerifyUrl } from "@/components/panels/wallet/rns/identity/catalog";
import {
  createAmpedPayProvider,
  createMockProvider,
  mockOutcome,
  resultOfStatus,
  type CheckoutQuote,
  type PayResult,
} from "@/components/checkout/provider";
import {
  Amount,
  FigureRow,
  Figures,
  SheetButton,
  SheetFrame,
  SheetMessage,
} from "@/components/checkout/PaySheet";

/**
 * app.amped.bio/pay/{intent} (docs/features/mobile-checkout.md 5 to 10, PRs CK-2 and CK-5).
 * One screen to pay a fixed amount. AmpedPay when the quote says so (CK-5), else the mock on
 * a test chain. The seller line names the store policy's seller and links the policy; a policy
 * published since the first quote shows before Pay.
 */

const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio";
const ON_TESTNET = paymentChain.testnet === true;
const CHECK_INTERVAL_MS = 3_000;

type Phase = "sheet" | "checking" | "pending" | "paid" | "failed";

/** A refusal the sheet shows as one message (spec 10); the rest change the sheet itself. */
type Problem =
  | { kind: "state"; state: "paused" | "limit" | "seller" | "removed" }
  | { kind: "message"; text: string };

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

/** The one message for a refusal the sheet cannot fix in place; null when it can. */
function problemOf(reason: PurchaseRefusal): Problem | null {
  switch (reason) {
    case "paused":
    case "limit":
    case "seller":
    case "removed":
      return { kind: "state", state: reason };
    case "no_wallet":
      return { kind: "message", text: CHECKOUT_COPY.noWallet };
    case "wallet_mismatch":
      return { kind: "message", text: CHECKOUT_COPY.walletMismatch };
    case "screening":
      return { kind: "message", text: CHECKOUT_COPY.screening };
    default:
      // price, policy_changed and insufficient_balance re-quote; owned and in_progress
      // resolve inside the provider
      return null;
  }
}

export function PayPage() {
  const { intentId = "" } = useParams();
  const validId = checkoutIntentIdSchema.safeParse(intentId).success;
  const { authUser } = useAuth();
  const { address } = useWalletContext();
  const sign = usePaymentChainSigner();
  const outcome = useMemo(() => mockOutcome(), []);
  const mock = useMemo(() => createMockProvider(outcome), [outcome]);
  const ampedPay = useMemo(
    () => createAmpedPayProvider({ sign, signer: address ?? undefined }),
    [sign, address]
  );
  const [phase, setPhase] = useState<Phase>("sheet");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [shortFromServer, setShortFromServer] = useState<bigint | null>(null);
  const [acceptedSignature, setAcceptedSignature] = useState<string | null>(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState<number | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
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
  const inFlight = intent.data?.status === "signing" || intent.data?.status === "submitted";

  // A fresh quote on every open and every return to the tab (spec 5). The mock provider
  // reads the same quote and adds the QA outcome from ?mock=
  const quote = useQuery({
    queryKey: ["checkout-quote", intentId],
    queryFn: () => mock.quote(intentId),
    enabled: claimed && intent.data?.status !== "paid",
    staleTime: 0,
    refetchOnWindowFocus: phase === "sheet",
    retry: false,
  });
  // AmpedPay when the server quotes it, unless QA asked for a mock outcome
  const provider = quote.data?.provider === "ampedpay" && !outcome ? ampedPay : mock;

  // A return to a signing or submitted intent shows Checking until the purchase is known
  // (spec 9, CK-Q43). Nothing sent yet reads null: the sheet opens as usual.
  const checking = useQuery({
    queryKey: ["checkout-purchase", intentId],
    queryFn: () => trpcClient.payments.forIntent.query({ intentId }),
    enabled: claimed && provider.id === "ampedpay" && (inFlight || phase === "pending"),
    refetchInterval: query => {
      const data = query.state.data;
      return data && !resultOfStatus(data.status) ? CHECK_INTERVAL_MS : false;
    },
    retry: false,
  });
  const checkingResult = checking.data ? resultOfStatus(checking.data.status) : null;

  const balance = useUsdcBalance(address as `0x${string}` | undefined);

  useEffect(() => {
    if (authUser && showExplainer) writeStorage("local", explainerKey(authUser.id), "1");
  }, [authUser, showExplainer]);

  // The first quote the fan sees becomes "what they saw", unless QA seeds a price change
  useEffect(() => {
    if (!quote.data || quote.data.state !== "ready") return;
    if (seen !== null) return;
    const seeded = mock.seedLastSeen(quote.data);
    const value = seeded ? `${seeded}:${quote.data.feeBps}` : seenSignature(quote.data);
    writeStorage("session", lastSeenKey(intentId), value);
    setSeen(value);
  }, [quote.data, intentId, mock, seen]);

  const q = quote.data;
  const item = q?.item;
  // AB-2: a merchant's service offer (an Authbase check). The sheet names the merchant, in the
  // Amped.Bio look, and returns to the Identity tab
  const service = q?.service ?? null;
  const creator =
    service && q?.creator
      ? { ...q.creator, name: service.merchantName, image: null, theme: null }
      : (q?.creator ?? null);

  // An 18+ item passes the Over 18 check first (spec 6, identity checks 4.2). The
  // stored result is read first, so a fan back from a pass is not sent round again.
  const adultItem = item?.adult === true;
  const ageCheck = useQuery({
    ...trpc.identity.myChecks.queryOptions(),
    enabled: adultItem,
    retry: false,
  });
  const agePassed = ageCheck.data?.ageOver18.pass === true;
  useEffect(() => {
    if (adultItem && (ageCheck.isError || (ageCheck.data && !agePassed))) {
      window.location.assign(`/age-check?returnTo=${encodeURIComponent(`/pay/${intentId}`)}`);
    }
  }, [adultItem, ageCheck.isError, ageCheck.data, agePassed, intentId]);
  const theme = creator?.theme ?? null;
  const pageHref = service
    ? service.rnsName
      ? `/wallet?tab=rns&name=${encodeURIComponent(service.rnsName)}&view=identity`
      : "/wallet?tab=rns"
    : creator
      ? `${LANDING}/${creator.handle}`
      : LANDING;
  const payingLabel = service ? SERVICE_CHECKOUT_COPY.paying : undefined;
  // The seller of record: the store policy's seller name once the creator has published one
  const seller =
    service?.merchantName ||
    q?.policy?.sellerName ||
    creator?.name ||
    (creator ? `@${creator.handle}` : "");

  const policy = useQuery({
    ...trpc.store.publicPolicy.queryOptions({
      handle: creator?.handle ?? "",
      v: q?.policy?.version,
    }),
    enabled: policyOpen && Boolean(creator && q?.policy),
    retry: false,
  });

  // Seller line on every sheet state where the creator is known: ready, short, price
  // changed, failed and paid (spec 5 CK-Q2, acceptance 13), with the store policy (CK-5)
  const sellerLine = creator ? (
    <p className="text-center text-[13px] leading-[18px] opacity-80">
      {CHECKOUT_COPY.soldBy(seller)}
      {service?.storePolicyUrl && (
        <>
          {" "}
          <a
            href={service.storePolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center font-semibold underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]"
          >
            {CHECKOUT_COPY.storePolicy}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </>
      )}
      {q?.policy && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            className="inline-flex min-h-touch items-center font-semibold underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]"
          >
            {CHECKOUT_COPY.storePolicy}
          </button>
        </>
      )}
    </p>
  ) : null;
  const notes = (
    <>
      {ON_TESTNET && (
        <p className="text-center text-[13px] leading-[18px] opacity-80">{CHECKOUT_COPY.staging}</p>
      )}
      {q && provider.id === "mock" && (
        <p className="text-center text-[13px] leading-[18px] opacity-80">{CHECKOUT_COPY.mock}</p>
      )}
    </>
  );
  const policySheet = q?.policy ? (
    <BottomSheet open={policyOpen} onOpenChange={setPolicyOpen}>
      <BottomSheetContent title={CHECKOUT_COPY.storePolicy}>
        {policy.isPending ? (
          <p role="status" className="text-prism-meta">
            Opening the store policy
          </p>
        ) : policy.isError || !policy.data ? (
          <p role="alert" className="text-prism-meta">
            The store policy did not load. Try again.
          </p>
        ) : (
          <div className="flex max-h-[60dvh] flex-col gap-[13px] overflow-y-auto">
            <p className="text-prism-meta font-semibold">{policy.data.notice}</p>
            <p className="whitespace-pre-line text-[15px] leading-[22px]">{policy.data.text}</p>
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  ) : null;

  if (!CHECKOUT_ON || !validId || intent.isError || intent.data?.status === "expired") {
    return (
      <SheetFrame creator={null} closeHref={LANDING} notes={notes}>
        <SheetMessage tone="error" title={CHECKOUT_COPY.ended} />
      </SheetFrame>
    );
  }

  if (intent.isPending || (quote.isPending && intent.data?.status !== "paid")) {
    return (
      <SheetFrame creator={creator} closeHref={pageHref} payingLabel={payingLabel}>
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

  const paid =
    intent.data?.status === "paid" ||
    phase === "paid" ||
    q?.state === "paid" ||
    checkingResult?.result === "paid";
  if (paid && service) {
    return (
      <SheetFrame
        creator={creator}
        closeHref={pageHref}
        notes={notes}
        payingLabel={payingLabel}
        footer={
          <>
            {sellerLine}
            {/* AB-3: Start verification goes to Authbase with the order when it is known */}
            <SheetButton
              theme={theme}
              href={
                (checking.data?.purchaseId && authbaseVerifyUrl(checking.data.purchaseId)) ||
                pageHref
              }
            >
              {SERVICE_CHECKOUT_COPY.startVerification}
            </SheetButton>
            <SheetButton theme={theme} href={pageHref} variant="secondary">
              {SERVICE_CHECKOUT_COPY.done}
            </SheetButton>
          </>
        }
      >
        <SheetMessage
          tone="done"
          title={
            q ? SERVICE_CHECKOUT_COPY.paid(service.merchantName, usdcDollars(q.amount)) : "Paid."
          }
        >
          <p className="text-[15px] leading-5 opacity-80">
            {SERVICE_CHECKOUT_COPY.next(service.merchantName)}
          </p>
        </SheetMessage>
      </SheetFrame>
    );
  }
  if (paid) {
    const itemHref = creator && item ? `${LANDING}${item.path}` : pageHref;
    return (
      <SheetFrame
        creator={creator}
        closeHref={pageHref}
        notes={notes}
        payingLabel={payingLabel}
        footer={
          <>
            {sellerLine}
            <SheetButton theme={theme} href={itemHref}>
              Open
            </SheetButton>
          </>
        }
      >
        <SheetMessage
          tone="done"
          title={creator && q ? CHECKOUT_COPY.paid(creator.handle, usdcDollars(q.amount)) : "Paid."}
        >
          {item && <p className="text-[15px] leading-5 opacity-80">{item.title}</p>}
        </SheetMessage>
        {policySheet}
      </SheetFrame>
    );
  }

  if (!q) return null;

  // Error states (spec 10): one message, one next step, the intent stays open
  const state = problem?.kind === "state" ? problem.state : q.state;
  const stateMessage =
    state === "paused"
      ? CHECKOUT_COPY.paused
      : state === "limit"
        ? CHECKOUT_COPY.limit
        : state === "seller" && creator
          ? service
            ? SERVICE_CHECKOUT_COPY.seller(service.merchantName)
            : CHECKOUT_COPY.seller(creator.handle)
          : state === "removed"
            ? service
              ? SERVICE_CHECKOUT_COPY.removed
              : CHECKOUT_COPY.removed
            : // An 18+ item needs the Over 18 check (spec 6, identity checks 4.2). That check
              // has no screen in the app yet (A1), so the sheet fails closed instead of Pay
              item?.adult
              ? CHECKOUT_COPY.over18
              : null;
  if (stateMessage) {
    return (
      <SheetFrame
        creator={creator}
        closeHref={pageHref}
        notes={notes}
        payingLabel={payingLabel}
        footer={
          state === "paused" ? (
            <SheetButton
              theme={theme}
              onClick={() => {
                setProblem(null);
                void quote.refetch();
              }}
            >
              Try again
            </SheetButton>
          ) : (
            <SheetButton theme={theme} href={pageHref} variant="secondary">
              {state === "limit" ? "Close" : "Back to the page"}
            </SheetButton>
          )
        }
      >
        <SheetMessage tone="error" title={stateMessage} />
      </SheetFrame>
    );
  }

  const stillChecking =
    phase === "pending" ||
    (inFlight && provider.id === "ampedpay" && checking.data && !checkingResult);
  if (phase === "checking" || stillChecking || (inFlight && checking.isPending)) {
    return (
      <SheetFrame creator={creator} closeHref={pageHref} payingLabel={payingLabel} notes={notes}>
        <SheetMessage
          tone="busy"
          title={
            phase === "pending"
              ? service
                ? SERVICE_CHECKOUT_COPY.stillChecking
                : CHECKOUT_COPY.stillChecking
              : CHECKOUT_COPY.checking
          }
        />
      </SheetFrame>
    );
  }

  const failed = phase === "failed" || checkingResult?.result === "failed";
  const amount = BigInt(q.amount);
  const override = provider.balanceOverride();
  const known = override ?? (USDC_FLAGS.wallet && balance.data !== undefined ? balance.data : null);
  const shortBy =
    shortFromServer !== null && shortFromServer > 0n
      ? shortFromServer
      : known !== null && known < amount
        ? amount - known
        : 0n;

  // Price changed (spec 5, c7): the fresh quote differs from what the fan last saw
  const signature = seenSignature(q);
  const priceChanged = seen !== null && seen !== signature && acceptedSignature !== signature;
  const wasAmount = seen?.split(":")[0];
  // Store policy changed (spec 10, CK-5): a version published since the first quote
  const policyChanged = Boolean(q.policy?.changed) && acceptedPolicy !== q.policy?.version;

  const handle = async (result: PayResult) => {
    if (result.result === "paid") return setPhase("paid");
    if (result.result === "pending") {
      await queryClient.invalidateQueries({ queryKey: ["checkout-purchase", intentId] });
      return setPhase("pending");
    }
    if (result.result === "rejected") {
      setProblem({ kind: "message", text: CHECKOUT_COPY.rejected });
      return setPhase("sheet");
    }
    if (result.result === "refused") {
      if (result.reason === "insufficient_balance" && result.shortBy) {
        setShortFromServer(BigInt(result.shortBy));
        return setPhase("sheet");
      }
      if (result.reason === "price" || result.reason === "policy_changed") {
        // The fresh quote carries the new amount or version; the sheet shows it before Pay
        setAcceptedPolicy(null);
        await quote.refetch();
        return setPhase("sheet");
      }
      setProblem(problemOf(result.reason) ?? { kind: "message", text: CHECKOUT_COPY.failed });
      return setPhase("sheet");
    }
    setPhase("failed");
  };

  const pay = async (options: { policyVersion?: number } = {}) => {
    setProblem(null);
    setShortFromServer(null);
    setPhase("checking");
    try {
      await handle(
        await provider.pay(intentId, q, {
          policyVersion: options.policyVersion ?? acceptedPolicy ?? undefined,
        })
      );
    } catch {
      setPhase("failed");
    }
  };

  const acceptPrice = () => {
    writeStorage("session", lastSeenKey(intentId), signature);
    setSeen(signature);
    setAcceptedSignature(signature);
  };

  const payLabel = `Pay ${usdcDollars(q.amount)} USDC`;
  const addUsdc = (
    <SheetButton theme={theme} href={`/wallet?fund=usdc&ci=${intentId}&need=${shortBy.toString()}`}>
      {CHECKOUT_COPY.addUsdc}
    </SheetButton>
  );
  const notNow = (
    <SheetButton theme={theme} href={pageHref} variant="secondary">
      Not now
    </SheetButton>
  );

  const action = failed ? (
    <SheetButton
      theme={theme}
      onClick={() => {
        setPhase("sheet");
        void queryClient.removeQueries({ queryKey: ["checkout-purchase", intentId] });
      }}
    >
      Try again
    </SheetButton>
  ) : priceChanged || policyChanged ? (
    <>
      {shortBy > 0n ? (
        // Price changed while short: Add USDC, never a Pay that cannot run (CK-Q9)
        addUsdc
      ) : (
        <SheetButton
          theme={theme}
          onClick={() => {
            const version = policyChanged ? q.policy?.version : undefined;
            if (priceChanged) acceptPrice();
            if (version !== undefined) setAcceptedPolicy(version);
            void pay({ policyVersion: version });
          }}
        >
          {payLabel}
        </SheetButton>
      )}
      {notNow}
    </>
  ) : shortBy > 0n ? (
    addUsdc
  ) : (
    <SheetButton theme={theme} onClick={() => void pay()}>
      {payLabel}
    </SheetButton>
  );

  const footer = (
    <>
      {sellerLine}
      {action}
    </>
  );

  return (
    <SheetFrame
      creator={creator}
      // The seller rule passed this quote (identity checks 5.1): the Verified chip (spec 5)
      verified={q.state === "ready"}
      closeHref={pageHref}
      notes={notes}
      payingLabel={payingLabel}
      footer={footer}
    >
      {failed && <SheetMessage tone="error" title={CHECKOUT_COPY.failed} />}
      {problem?.kind === "message" && (
        <p
          role="alert"
          className="rounded-prism-13 border-2 border-current p-[13px] font-prism text-[15px] font-semibold leading-5"
        >
          {problem.text}
        </p>
      )}
      {priceChanged && wasAmount && (
        <p
          role="alert"
          className="rounded-prism-13 border-2 border-current p-[13px] font-prism text-[15px] font-semibold leading-5 tabular-nums"
        >
          {CHECKOUT_COPY.priceChanged(usdcDollars(wasAmount), usdcDollars(q.amount))}
        </p>
      )}
      {policyChanged && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-prism-13 border-2 border-current p-[13px] font-prism"
        >
          <p className="text-[15px] font-semibold leading-5">
            {CHECKOUT_COPY.policyChanged(seller)}
          </p>
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            className="inline-flex min-h-touch items-center self-start text-[15px] font-semibold underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]"
          >
            {CHECKOUT_COPY.readPolicy}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-1 pt-[13px]">
        <h1 className="text-[21px] font-bold leading-7">{item?.title}</h1>
        <p className="text-[15px] leading-5 opacity-80">
          {STORE_COPY.accessLine(item?.accessPeriodDays ?? null)}
        </p>
        {/* C12: the promoter in the split, named before Pay (content spec 3.9, st9) */}
        {q.promoter && (
          <p className="text-[13px] leading-[18px] opacity-80">
            {PROMOTER_COPY.referredBy(q.promoter.handle)}
          </p>
        )}
      </div>
      <Figures>
        <FigureRow label="Amount" value={<Amount units={q.amount} />} />
        <FigureRow
          label={`${CHECKOUT_COPY.feeIncluded} (${formatBps(q.feeBps)})`}
          value={<Amount units={q.fee} />}
        />
        <FigureRow label={CHECKOUT_COPY.networkFee} value={CHECKOUT_COPY.networkFeePaid} />
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
      {policySheet}
    </SheetFrame>
  );
}
