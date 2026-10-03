import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  Button,
  Checkbox,
  CommitAction,
  ErrorCard,
  Notice,
  SidePanel,
  StepBar,
  TESTNET_NOTICE,
  cn,
} from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { useWalletContext } from "@/contexts/WalletContext";
import { useDelayed } from "@/hooks/useDelayed";
import { useAuthbaseIdentityStatus } from "@/hooks/rns/useAuthbaseIdentityStatus";
import { useRegisterName, useSetPrimaryName, type TxState } from "@/hooks/rns/useRegistration";
import { RNS_FLAGS } from "@/config/rns/flags";
import FundWalletDialog from "../dialogs/FundWalletDialog";
import { Eyebrow, TestnetLine } from "../../explore/pool-panel/sections";
import { DurationPicker } from "./DurationPicker";
import { WrongNetworkNotice } from "./FindRnsName";
import { useMinRegistration, useRnsAvailability, useRnsChain, useRnsNetwork } from "./hooks";
import {
  formatRnsAmount,
  formatRnsDate,
  formatTerm,
  shortAddress,
  termRules,
  termSeconds,
  type Term,
} from "./format";
import { RnsName } from "./shared";

type Step = "name" | "review" | "result" | "primary";
const STEPS = ["Name", "Review", "Confirm in wallet"];

const ArtTile = () => (
  <span className="flex h-full w-full items-center justify-center bg-prism-value-panel-1">
    <AtSign aria-hidden className="h-[34px] w-[34px]" color="#6E3A82" />
  </span>
);

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
      <dt className="text-prism-label text-prism-ink-2">{label}</dt>
      <dd
        className={cn(
          "text-right text-prism-label tabular-nums text-prism-ink",
          strong ? "font-bold" : "font-semibold"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function TxLink({ explorer, hash }: { explorer?: string; hash?: string }) {
  if (!explorer || !hash) return null;
  return (
    <Button asChild variant="ghost">
      <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
        View transaction
        <ExternalLink aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  );
}

/** The solid compliance notice with the J0 line, plus an optional sentence. */
function TestnetNotice({ extra }: { extra?: string }) {
  const body = TESTNET_NOTICE.replace(/^Testnet only\.\s*/, "");
  return (
    <Notice variant="warning" title="Testnet only.">
      {body}
      {extra ? ` ${extra}` : ""}
    </Notice>
  );
}

/** Confirm in wallet and on chain status rows (078 I11). */
function ChainStatus({ tx, explorer, what }: { tx: TxState; explorer?: string; what: string }) {
  if (tx.phase !== "chain") return null;
  return (
    <div className="space-y-2">
      <div className="prism-slab flex min-h-commit items-center gap-3 px-4" role="status">
        <LoaderCircle
          aria-hidden
          className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
        />
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">{what}</span>
        <TxLink explorer={explorer} hash={tx.hash} />
      </div>
      <p className="text-prism-meta text-prism-ink-2">
        {what === "Registering on chain"
          ? "Registration continues if you close this panel."
          : "This continues if you close this panel."}
      </p>
    </div>
  );
}

/**
 * Screen Review 078: register an RNS name as one money flow in the G3 value
 * panel. Name (term and chain priced costs), Review in the calm commit state,
 * Confirm in wallet, then the result with Set as primary, Show on my page and
 * the identity step.
 */
export function RegisterFlow({
  label,
  onClose,
  onOpenName,
  onRegisterAnother,
  onShowOnPage,
}: {
  label: string;
  onClose: () => void;
  onOpenName: (label: string, view?: string) => void;
  onRegisterAnother: () => void;
  onShowOnPage: () => void;
}) {
  const chain = useRnsChain();
  const symbol = chain.nativeCurrency.symbol;
  const explorer = chain.blockExplorers?.default?.url;
  const fullName = formatRnsName(label, chain.id);
  const network = useRnsNetwork();
  const wallet = useWalletContext();
  const { address } = useAccount();
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: !!address } });
  const balanceWei = balance.data?.value;

  const min = useMinRegistration();
  const rules = min.data !== undefined ? termRules(min.data) : null;
  const [term, setTerm] = useState<Term | null>(null);
  useEffect(() => {
    if (rules && !term) setTerm({ unit: rules.unit, count: rules.min });
  }, [rules, term]);
  const seconds = term ? termSeconds(term) : undefined;

  const availability = useRnsAvailability(label, seconds);
  const priceWei = availability.priceWei;
  const reg = useRegisterName(label, seconds, priceWei);
  const primary = useSetPrimaryName(fullName);
  const identity = useAuthbaseIdentityStatus(RNS_FLAGS.identity ? address : null);

  const [step, setStep] = useState<Step>("name");
  const [agreed, setAgreed] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [registeredAt, setRegisteredAt] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 078 I14: a name that is taken on open goes to its name page
  useEffect(() => {
    if (step === "name" && availability.status === "registered" && reg.tx.phase === "idle") {
      onOpenName(label);
    }
  }, [availability.status, step, reg.tx.phase, label, onOpenName]);

  useEffect(() => {
    if (step === "name") setAgreed(false);
  }, [step]);

  useEffect(() => {
    if (reg.tx.phase === "done") {
      setRegisteredAt(Math.floor(Date.now() / 1000));
      setStep("result");
    }
  }, [reg.tx.phase]);

  useEffect(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [step]);

  const feeWei = reg.feeWei;
  const totalWei = priceWei !== undefined && feeWei !== undefined ? priceWei + feeWei : undefined;
  const amount = (wei: bigint) => `${formatRnsAmount(wei)} ${symbol}`;
  const short = address ? shortAddress(address) : "";
  const now = Math.floor(Date.now() / 1000);
  const expires = (registeredAt ?? now) + Number(seconds ?? 0n);
  const insufficient = totalWei !== undefined && balanceWei !== undefined && totalWei > balanceWei;
  const ready =
    network.isConnected &&
    !network.wrongNetwork &&
    totalWei !== undefined &&
    balanceWei !== undefined &&
    !insufficient &&
    availability.status === "available";
  const loading =
    network.isConnected &&
    !network.wrongNetwork &&
    (min.isLoading ||
      availability.status === "checking" ||
      priceWei === undefined ||
      reg.feeLoading ||
      reg.primaryLoading);
  const showSkeleton = useDelayed(loading && !reg.feeFailed, 400);
  const signing = reg.tx.phase === "signing" || primary.tx.phase === "signing";
  const verified = RNS_FLAGS.identity && !!identity.data?.verified;
  const becamePrimary = reg.reverseRecord;

  const copyAddress = () =>
    address &&
    navigator.clipboard
      .writeText(address)
      .then(() => toast.add({ title: "Address copied", type: "success" }))
      .catch(() => undefined);

  const stepIndex =
    step === "result" ? 3 : reg.tx.phase === "chain" || signing ? 2 : step === "review" ? 1 : 0;

  /* ---------------------------------------------------------------------- */
  /* Name step                                                              */
  /* ---------------------------------------------------------------------- */

  let nameBody: React.ReactNode = null;
  let nameFooter: React.ReactNode = null;
  if (!network.isConnected) {
    nameBody = (
      <Notice variant="info">
        Connect your wallet to register an RNS name. The price and the network fee show once it is
        connected.
      </Notice>
    );
    nameFooter = (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => void wallet.connect()}
          disabled={wallet.connecting}
        >
          <Wallet aria-hidden />
          Connect wallet
        </Button>
      </>
    );
  } else if (network.wrongNetwork) {
    nameBody = (
      <WrongNetworkNotice onSwitch={network.switchToLibertas} switching={network.switching} />
    );
    nameFooter = <TestnetLine />;
  } else if (loading && !reg.feeFailed) {
    nameBody = showSkeleton ? (
      <div aria-hidden className="prism-slab space-y-0 divide-y divide-prism-line">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex h-touch items-center justify-between px-4">
            <span className="h-3.5 w-32 rounded-full bg-prism-line motion-safe:animate-pulse" />
            <span className="h-3.5 w-24 rounded-full bg-prism-line motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    ) : null;
    nameFooter = (
      <>
        <TestnetLine />
        <Button type="button" size="lg" className="w-full" disabled>
          Review
        </Button>
      </>
    );
  } else {
    nameBody = (
      <div className="space-y-3">
        <dl className="prism-slab divide-y divide-prism-line">
          <Row label="Registration price">
            {priceWei !== undefined ? amount(priceWei) : "Loading"}
          </Row>
          {reg.feeFailed ? (
            <div className="flex min-h-touch items-center justify-between gap-3 px-4 py-1">
              <dt className="text-prism-label text-prism-ink-2">Network fee: not available</dt>
              <dd>
                <Button type="button" variant="secondary" onClick={reg.retryFee}>
                  <RefreshCw aria-hidden />
                  Retry
                </Button>
              </dd>
            </div>
          ) : (
            <Row label="Network fee (estimate)">
              {feeWei !== undefined ? amount(feeWei) : "Loading"}
            </Row>
          )}
          <Row label="Total" strong>
            {totalWei !== undefined ? amount(totalWei) : "Not available"}
          </Row>
          <Row label="Available">{balanceWei !== undefined ? amount(balanceWei) : "Loading"}</Row>
          <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
            <dt className="text-prism-label text-prism-ink-2">Balance after</dt>
            {insufficient ? (
              <dd
                role="alert"
                className="flex items-center gap-1.5 text-right text-prism-meta text-prism-danger"
              >
                <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
                Not enough {symbol} for this registration.
              </dd>
            ) : (
              <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
                {totalWei !== undefined && balanceWei !== undefined
                  ? amount(balanceWei - totalWei)
                  : "Not available"}
              </dd>
            )}
          </div>
        </dl>
        {insufficient && (
          <Button type="button" variant="ghost" onClick={() => setFundOpen(true)}>
            <Plus aria-hidden />
            Get {symbol}
          </Button>
        )}
      </div>
    );
    nameFooter = (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!ready}
          onClick={() => setStep("review")}
        >
          Review
        </Button>
      </>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Review                                                                 */
  /* ---------------------------------------------------------------------- */

  const taken = availability.status === "registered" && reg.tx.phase === "idle";
  const primaryRow = reg.primaryName ? `Stays ${reg.primaryName}` : `Becomes ${fullName}`;
  const reviewBody = (
    <>
      {taken ? (
        <ErrorCard
          title="This RNS name was just registered by someone else."
          onRetry={onRegisterAnother}
          retryLabel="Back to search"
          className="!rounded-prism-21"
        />
      ) : (
        <>
          {totalWei !== undefined && <YouPay amount={formatRnsAmount(totalWei)} unit={symbol} />}
          <dl className="prism-slab divide-y divide-prism-line">
            <Row label="RNS name">
              <RnsName label={label} chainId={chain.id} />
            </Row>
            <Row label="Owner">
              <span className="inline-flex items-center gap-1">
                Your wallet · {short}
                <button
                  type="button"
                  aria-label="Copy address"
                  onClick={copyAddress}
                  className="prism-focus -my-2 inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2"
                >
                  <Copy aria-hidden className="h-4 w-4" />
                </button>
              </span>
            </Row>
            <Row label="Duration">
              <span className="inline-flex items-center gap-2">
                {term && formatTerm(term)}
                <Button
                  type="button"
                  variant="ghost"
                  className="-my-2"
                  onClick={() => setStep("name")}
                  disabled={signing || reg.tx.phase === "chain"}
                >
                  Edit
                </Button>
              </span>
            </Row>
            <Row label="Expires on">{formatRnsDate(expires)}</Row>
            <Row label="Registration price">{priceWei !== undefined && amount(priceWei)}</Row>
            <Row label="Network fee (estimate)">{feeWei !== undefined && amount(feeWei)}</Row>
            <Row label="Total" strong>
              {totalWei !== undefined && amount(totalWei)}
            </Row>
            <Row label="Balance after">
              {totalWei !== undefined && balanceWei !== undefined && amount(balanceWei - totalWei)}
            </Row>
            <Row label="Primary RNS name">{primaryRow}</Row>
          </dl>
          <TestnetNotice
            extra={`Your RNS name expires on ${formatRnsDate(expires)}. Extend it before then to keep it.`}
          />
          <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
            I understand this RNS name expires on {formatRnsDate(expires)} unless I extend it.{" "}
            <span className="text-prism-ink-2">(Required)</span>
          </Checkbox>
          {reg.tx.phase === "declined" && (
            <Notice variant="info" role="status">
              You declined in your wallet. Nothing was sent.
            </Notice>
          )}
          {reg.tx.phase === "failed" && (
            <div className="space-y-2">
              <ErrorCard
                title="Registration did not go through"
                cause="The transaction failed. The amount did not move. The network fee may still be charged."
                onRetry={() => {
                  reg.reset();
                  void reg.register();
                }}
                retryLabel="Retry"
                className="!rounded-prism-21"
              />
              <TxLink explorer={explorer} hash={reg.tx.hash} />
            </div>
          )}
          <ChainStatus tx={reg.tx} explorer={explorer} what="Registering on chain" />
        </>
      )}
    </>
  );

  const reviewFooter = taken ? null : (
    <>
      <CommitAction
        disabled={!agreed || signing || reg.tx.phase === "chain" || !ready}
        onClick={() => void reg.register()}
      >
        {signing ? (
          "Check your wallet"
        ) : (
          <>
            <AtSign aria-hidden />
            Register for {totalWei !== undefined ? amount(totalWei) : ""}
          </>
        )}
      </CommitAction>
      {!signing && reg.tx.phase !== "chain" && (
        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={() => setStep("name")}>
            Back
          </Button>
        </div>
      )}
    </>
  );

  /* ---------------------------------------------------------------------- */
  /* Result                                                                 */
  /* ---------------------------------------------------------------------- */

  const primaryDone = primary.tx.phase === "done";
  const isPrimaryNow = becamePrimary || primaryDone;
  const resultBody = (
    <>
      <dl className="prism-slab divide-y divide-prism-line">
        <div className="flex min-h-commit items-center gap-2 px-4">
          <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
          <p className="text-prism-panel-title text-prism-success">
            <span className="break-all">{fullName}</span> is yours
          </p>
        </div>
        <Row label="Expires on">{formatRnsDate(expires)}</Row>
        <Row label="Paid" strong>
          {reg.tx.paidWei !== undefined ? amount(reg.tx.paidWei) : "Not available"}
        </Row>
        <Row label="Primary RNS name">
          {isPrimaryNow
            ? `Now ${fullName}`
            : reg.primaryName
              ? `${reg.primaryName}, unchanged`
              : "None"}
        </Row>
        <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-1">
          <dt className="text-prism-label text-prism-ink-2">Transaction</dt>
          <dd>
            <TxLink explorer={explorer} hash={reg.tx.hash} />
          </dd>
        </div>
      </dl>
      <p className="text-prism-meta text-prism-ink-2">
        Paid is the price plus the network fee from the receipt.
      </p>
      <div className="space-y-2">
        <Eyebrow>What next</Eyebrow>
        <ul className="prism-slab divide-y divide-prism-line">
          {!isPrimaryNow && (
            <NextRow
              icon={Check}
              title="Set as primary"
              meta={`Your wallet shows as ${fullName}.`}
              onClick={() => setStep("primary")}
            />
          )}
          <NextRow
            icon={LayoutTemplate}
            title="Show on my page"
            meta="Choose the RNS name fans see on your page."
            onClick={onShowOnPage}
          />
          {RNS_FLAGS.identity &&
            (verified ? (
              <NextRow
                icon={ShieldCheck}
                title="Verified owner"
                meta="ID checked by Authbase."
                onClick={() => onOpenName(label, "identity")}
              />
            ) : (
              <NextRow
                icon={ShieldCheck}
                title="Get verified"
                meta="Authbase checks your ID so people can trust your name."
                onClick={() => onOpenName(label, "identity")}
              />
            ))}
        </ul>
      </div>
    </>
  );
  const resultFooter = (
    <>
      <TestnetLine />
      <Button type="button" size="lg" className="w-full" onClick={() => onOpenName(label)}>
        Open <span className="truncate">{fullName}</span>
      </Button>
      <div className="flex justify-center">
        <Button type="button" variant="ghost" onClick={onRegisterAnother}>
          Register another
        </Button>
      </div>
    </>
  );

  /* ---------------------------------------------------------------------- */
  /* Set as primary review (078 I13)                                        */
  /* ---------------------------------------------------------------------- */

  const primarySigning = primary.tx.phase === "signing";
  const primaryBody = (
    <>
      <dl className="prism-slab divide-y divide-prism-line">
        <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
          <dt className="text-prism-label text-prism-ink-2">Primary RNS name</dt>
          <dd className="text-right">
            {reg.primaryName && (
              <span className="block text-prism-meta text-prism-ink-2">Now {reg.primaryName}</span>
            )}
            <span className="block text-prism-label font-semibold text-prism-ink">
              → {fullName}
            </span>
          </dd>
        </div>
        {primary.feeFailed ? (
          <div className="flex min-h-touch items-center justify-between gap-3 px-4 py-1">
            <dt className="text-prism-label text-prism-ink-2">Network fee: not available</dt>
            <dd>
              <Button type="button" variant="secondary" onClick={primary.retryFee}>
                Retry
              </Button>
            </dd>
          </div>
        ) : (
          <Row label="Network fee (estimate)">
            {primary.feeWei !== undefined ? amount(primary.feeWei) : "Loading"}
          </Row>
        )}
        <Row label="Balance after">
          {primary.feeWei !== undefined && balanceWei !== undefined
            ? amount(balanceWei - primary.feeWei)
            : "Loading"}
        </Row>
      </dl>
      <p className="text-prism-meta text-prism-ink-2">
        Wallets and apps show {short} as {fullName}.
        {reg.primaryName && ` ${reg.primaryName} stays yours and keeps working.`}
      </p>
      <TestnetNotice />
      {primary.tx.phase === "declined" && (
        <Notice variant="info" role="status">
          You declined in your wallet. Nothing was sent.
        </Notice>
      )}
      {primary.tx.phase === "failed" && (
        <ErrorCard
          title="Primary RNS name did not change"
          cause="The transaction failed. The network fee may still be charged."
          onRetry={() => {
            primary.reset();
            void primary.setPrimary();
          }}
          retryLabel="Retry"
          className="!rounded-prism-21"
        />
      )}
      <ChainStatus tx={primary.tx} explorer={explorer} what="Setting the primary name on chain" />
    </>
  );
  const primaryFooter = (
    <>
      <CommitAction
        disabled={primary.feeWei === undefined || primarySigning || primary.tx.phase === "chain"}
        onClick={() => void primary.setPrimary()}
      >
        {primarySigning ? (
          "Check your wallet"
        ) : (
          <>
            <Check aria-hidden />
            Set as primary
          </>
        )}
      </CommitAction>
      {!primarySigning && primary.tx.phase !== "chain" && (
        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={() => setStep("result")}>
            Back
          </Button>
        </div>
      )}
    </>
  );

  // After Set as primary confirms, return to the result with the new primary
  useEffect(() => {
    if (primaryDone && step === "primary") setStep("result");
  }, [primaryDone, step]);

  const body =
    step === "name" ? (
      <>
        {min.data !== undefined && term ? (
          <DurationPicker
            minSeconds={min.data}
            value={term}
            onChange={next => setTerm(next)}
            fromSeconds={now}
          />
        ) : min.isError ? (
          <ErrorCard
            title="Durations did not load"
            cause="The registrar did not respond."
            onRetry={() => void min.refetch()}
            retryLabel="Retry"
            className="!rounded-prism-21"
          />
        ) : null}
        {nameBody}
      </>
    ) : step === "review" ? (
      reviewBody
    ) : step === "result" ? (
      resultBody
    ) : (
      primaryBody
    );

  const footer =
    step === "name"
      ? nameFooter
      : step === "review"
        ? reviewFooter
        : step === "result"
          ? resultFooter
          : primaryFooter;

  const stepTitle =
    step === "primary"
      ? "Step 1 of 2, Review"
      : step === "result"
        ? `${fullName} is yours`
        : `Step ${stepIndex + 1} of 3, ${STEPS[stepIndex]}`;

  return (
    <>
      <SidePanel
        open
        onOpenChange={next => {
          if (!next) onClose();
        }}
        eyebrow={step === "primary" ? "Set primary RNS name" : "Register an RNS name"}
        title={<RnsName label={label} chainId={chain.id} />}
        byline={network.isConnected ? `For your wallet · ${short}` : "Wallet not connected"}
        art={<ArtTile />}
        calm={step !== "name"}
        dismissible={!signing && !primarySigning}
        footer={footer}
      >
        <h3 ref={headingRef} tabIndex={-1} className="sr-only">
          {stepTitle}
        </h3>
        {step === "primary" ? (
          <StepBar
            steps={["Review", "Confirm in wallet"]}
            current={primarySigning || primary.tx.phase === "chain" ? 1 : 0}
          />
        ) : (
          <StepBar steps={STEPS} current={stepIndex} />
        )}
        {body}
      </SidePanel>
      <FundWalletDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        openReceiveModal={() => setFundOpen(false)}
      />
    </>
  );
}

/** 078 I08: the You pay well in the calm commit state, Bebas amount and unit pill. */
function YouPay({ amount, unit }: { amount: string; unit: string }) {
  const size =
    amount.length > 11
      ? "text-[42px] leading-[42px]"
      : amount.length > 8
        ? "text-[55px] leading-[55px] sm:text-[68px] sm:leading-[68px]"
        : "text-[68px] leading-[68px] sm:text-[88px] sm:leading-[88px]";
  return (
    <div className="rounded-prism-21 bg-white/80 px-5 pb-4 pt-3 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
      <p className="text-prism-eyebrow uppercase text-prism-ink-2">You pay</p>
      <p className="mt-1 flex min-w-0 items-end gap-2">
        <span
          className={cn("min-w-0 truncate font-prism-display tabular-nums text-prism-ink", size)}
        >
          {amount}
        </span>
        <span className="mb-2 shrink-0 text-prism-label font-bold text-prism-ink">{unit}</span>
      </p>
    </div>
  );
}

function NextRow({
  icon: Icon,
  title,
  meta,
  onClick,
}: {
  icon: typeof Check;
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="prism-focus flex min-h-commit w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-prism-8 bg-white/80 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
          <Icon aria-hidden className="h-[18px] w-[18px] text-prism-ink-2" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-prism-label font-semibold text-prism-ink">{title}</span>
          <span className="block text-prism-meta text-prism-ink-2">{meta}</span>
        </span>
        <ChevronRight aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
      </button>
    </li>
  );
}
