import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { AlertCircle, CalendarPlus, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { Button, Checkbox, CommitAction, ErrorCard, Notice, SidePanel, StepBar } from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { useRenewName } from "@/hooks/rns/useRenewal";
import FundWalletDialog from "../../dialogs/FundWalletDialog";
import { TestnetLine } from "../../../explore/pool-panel/sections";
import { DurationPicker } from "../DurationPicker";
import { useMinRegistration } from "../hooks";
import {
  formatRnsAmount,
  formatRnsDate,
  formatTerm,
  shortAddress,
  termRules,
  termSeconds,
  type Term,
} from "../format";
import { NameTile, RnsName } from "../shared";
import { ChainStatus, Row, TestnetNotice, TxLink, YouPay } from "../flowParts";
import { useNameFlowGate } from "./NameFlowGate";
import type { RnsNameState } from "./useRnsName";

type Step = "duration" | "review" | "result";
const STEPS = ["Duration", "Review", "Confirm in wallet"];

/**
 * Screen Review 080 I01 to I06, I18: Extend in the value panel. Duration,
 * Review (no editable control, every figure, the J0 notice and the required
 * checkbox), Confirm in wallet, then the result with Paid from the receipt.
 * Any connected wallet may pay; Review says so when it is not the owner.
 */
export function ExtendFlow({
  name,
  chainId,
  onClose,
  onExtended,
}: {
  name: RnsNameState;
  chainId: number;
  onClose: () => void;
  onExtended: () => void;
}) {
  const fullName = formatRnsName(name.label, chainId);
  const { address, chain } = useAccount();
  const explorer = chain?.blockExplorers?.default?.url;
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const balance = useBalance({ address, chainId, query: { enabled: !!address } });
  const balanceWei = balance.data?.value;
  const gate = useNameFlowGate(name, chainId, { ownerOnly: false, verb: "extend" });

  const min = useMinRegistration();
  const rules = min.data !== undefined ? termRules(min.data) : null;
  const [term, setTerm] = useState<Term | null>(null);
  useEffect(() => {
    if (rules && !term) setTerm({ unit: rules.unit, count: rules.min });
  }, [rules, term]);
  const seconds = term ? termSeconds(term) : undefined;
  const renewal = useRenewName(name.label, seconds);

  const [step, setStep] = useState<Step>("duration");
  const [agreed, setAgreed] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [extendedTo, setExtendedTo] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const now = Math.floor(Date.now() / 1000);
  const currentExpiry = name.expiry ?? now;
  const newExpiry = currentExpiry + Number(seconds ?? 0n);
  const priceWei = renewal.priceWei;
  const feeWei = renewal.feeWei;
  const totalWei = priceWei !== undefined && feeWei !== undefined ? priceWei + feeWei : undefined;
  const insufficient = totalWei !== undefined && balanceWei !== undefined && totalWei > balanceWei;
  const amount = (wei: bigint) => `${formatRnsAmount(wei)} ${symbol}`;
  const phase = renewal.tx.phase;
  const signing = phase === "signing";
  const busy = signing || phase === "chain";
  const payerIsOwner =
    !!address && !!name.owner && address.toLowerCase() === name.owner.toLowerCase();

  useEffect(() => {
    if (step === "duration") setAgreed(false);
  }, [step]);
  useEffect(() => {
    if (phase === "done") {
      setExtendedTo(newExpiry);
      setStep("result");
      onExtended();
    }
    // newExpiry is read once when the receipt lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [step]);

  const figures = (
    <>
      <Row label="Renewal price">
        {renewal.priceFailed
          ? "Not available"
          : priceWei !== undefined
            ? amount(priceWei)
            : "Loading"}
      </Row>
      {renewal.feeFailed ? (
        <div className="flex min-h-touch items-center justify-between gap-3 px-4 py-1">
          <dt className="text-prism-label text-prism-ink-2">Network fee: not available</dt>
          <dd>
            <Button type="button" variant="secondary" onClick={renewal.retryFee}>
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
    </>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === "result" && extendedTo) {
    body = (
      <dl className="prism-slab divide-y divide-prism-line">
        <div className="flex min-h-commit items-center gap-2 px-4 py-2">
          <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
          <p className="text-[20px] font-bold leading-[23px] text-prism-success">
            <span className="break-all">{fullName}</span> now expires on {formatRnsDate(extendedTo)}
          </p>
        </div>
        <Row label="New expiry" strong>
          {formatRnsDate(extendedTo)}
        </Row>
        <Row label="Paid" strong>
          {renewal.tx.paidWei !== undefined ? amount(renewal.tx.paidWei) : "Not available"}
        </Row>
        <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-1">
          <dt className="text-prism-label text-prism-ink-2">Transaction</dt>
          <dd>
            <TxLink explorer={explorer} hash={renewal.tx.hash} />
          </dd>
        </div>
      </dl>
    );
    footer = (
      <>
        <TestnetLine />
        <Button type="button" size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      </>
    );
  } else if (gate) {
    body = gate.body;
    footer = gate.footer;
  } else if (step === "duration") {
    body = (
      <>
        {min.data !== undefined && term && rules ? (
          <DurationPicker
            minSeconds={min.data}
            value={term}
            onChange={setTerm}
            fromSeconds={currentExpiry}
            label="Add time"
            hint={`Shortest is ${formatTerm({ unit: rules.unit, count: rules.min })}`}
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
        <dl className="prism-slab divide-y divide-prism-line">
          <Row label="Current expiry">{name.expiry ? formatRnsDate(name.expiry) : "Unknown"}</Row>
          <Row label="New expiry" strong>
            {formatRnsDate(newExpiry)}
          </Row>
          {figures}
          <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
            <dt className="text-prism-label text-prism-ink-2">Balance after</dt>
            {insufficient ? (
              <dd
                role="alert"
                className="flex items-center gap-1.5 text-right text-prism-meta text-prism-danger"
              >
                <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
                Not enough {symbol} to extend.
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
      </>
    );
    footer = (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={totalWei === undefined || balanceWei === undefined || insufficient}
          onClick={() => setStep("review")}
        >
          Review
        </Button>
      </>
    );
  } else {
    body = (
      <>
        {totalWei !== undefined && <YouPay amount={formatRnsAmount(totalWei)} unit={symbol} />}
        <dl className="prism-slab divide-y divide-prism-line">
          <Row label="Current expiry">{name.expiry ? formatRnsDate(name.expiry) : "Unknown"}</Row>
          <Row label="New expiry" strong>
            {formatRnsDate(newExpiry)}
          </Row>
          <Row label="Duration">
            <span className="inline-flex items-center gap-2">
              {term && formatTerm(term)}
              <Button
                type="button"
                variant="ghost"
                className="-my-2"
                onClick={() => setStep("duration")}
                disabled={busy}
              >
                Edit
              </Button>
            </span>
          </Row>
          {figures}
          <Row label="Balance after">
            {totalWei !== undefined && balanceWei !== undefined
              ? amount(balanceWei - totalWei)
              : "Not available"}
          </Row>
          {!payerIsOwner && address && <Row label="Paid from">{shortAddress(address)}</Row>}
        </dl>
        <TestnetNotice />
        <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
          I want to extend {fullName} until {formatRnsDate(newExpiry)}.{" "}
          <span className="text-prism-ink-2">(Required)</span>
        </Checkbox>
        {phase === "declined" && (
          <Notice variant="info" role="status">
            You declined in your wallet. Nothing was sent.
          </Notice>
        )}
        {phase === "failed" && (
          <div className="space-y-2">
            <ErrorCard
              title="Extending did not go through"
              cause="The transaction failed. The amount did not move. The network fee may still be charged."
              onRetry={() => {
                renewal.reset();
                void renewal.renew();
              }}
              retryLabel="Retry"
              className="!rounded-prism-21"
            />
            <TxLink explorer={explorer} hash={renewal.tx.hash} />
          </div>
        )}
        <ChainStatus
          tx={renewal.tx}
          explorer={explorer}
          what="Extending on chain"
          note="Extending continues if you close this panel."
        />
      </>
    );
    footer = (
      <>
        <CommitAction
          disabled={!agreed || busy || totalWei === undefined || insufficient}
          onClick={() => void renewal.renew()}
        >
          {signing ? (
            "Check your wallet"
          ) : (
            <>
              <CalendarPlus aria-hidden />
              Extend for {totalWei !== undefined ? amount(totalWei) : ""}
            </>
          )}
        </CommitAction>
        {!busy && (
          <div className="flex justify-center">
            <Button type="button" variant="ghost" onClick={() => setStep("duration")}>
              Back
            </Button>
          </div>
        )}
      </>
    );
  }

  const current = step === "result" ? 3 : busy ? 2 : step === "review" ? 1 : 0;
  return (
    <>
      <SidePanel
        open
        onOpenChange={next => {
          if (!next) onClose();
        }}
        eyebrow="Extend an RNS name"
        title={<RnsName label={name.label} chainId={chainId} />}
        byline={
          name.owner
            ? `Owned by ${name.isOwner ? "you" : "another wallet"} · ${shortAddress(name.owner)}`
            : undefined
        }
        art={<NameTile src={name.records.avatar} size={55} />}
        calm={step !== "duration"}
        dismissible={!signing}
        footer={footer}
      >
        <h3 ref={headingRef} tabIndex={-1} className="sr-only">
          {step === "result" && extendedTo
            ? `${fullName} now expires on ${formatRnsDate(extendedTo)}`
            : `Step ${current + 1} of 3, ${STEPS[current]}`}
        </h3>
        <StepBar steps={STEPS} current={current} />
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
