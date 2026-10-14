import { useEffect, useId, useRef, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import type { Address } from "viem";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  Button,
  Checkbox,
  CommitAction,
  Notice,
  SidePanel,
  StepBar,
  cn,
  type RouterOutputs,
} from "@repo/ui";
import { formatRnsName, parseRnsInput } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { useEditor } from "@/contexts/EditorContext";
import type { useTransferOwnership } from "@/hooks/rns/useTransferOwnership";
import { classifyTxError } from "../../../explore/pool-panel/format";
import { TestnetLine } from "../../../explore/pool-panel/sections";
import { formatRnsAmount, shortAddress } from "../format";
import { NameTile, RnsName } from "../shared";
import { Row, TxLink } from "../flowParts";
import { useAddressSummary } from "../hooks";
import { useNameFlowGate } from "./NameFlowGate";
import { useRecipient } from "./useRecipient";
import type { RnsNameState } from "./useRnsName";
import type { TransferDraft } from "./transferDraft";

type RnsAddressSummaryOutput = RouterOutputs["rns"]["addressSummary"];

const STEPS = ["Recipient", "Review", "Confirm in wallet"];

/** 110 D2: the recipient card. Verified owner, or the caution, never Authbase attributes. */
export function RecipientTrustCard({
  address,
  label,
  chainId,
  summary,
  ownerDiffers,
}: {
  address: Address;
  label: string | null;
  chainId: number;
  summary: RnsAddressSummaryOutput | null;
  ownerDiffers?: boolean;
}) {
  const person = summary?.person ?? null;
  const verified = summary?.verified === true && !ownerDiffers;
  const copy = () =>
    navigator.clipboard
      .writeText(address)
      .then(() => toast.add({ title: "Copied", type: "success" }))
      .catch(() => undefined);
  return (
    <div className="prism-glass-clear !rounded-prism-13 space-y-2 p-[13px]">
      <div className="flex items-center gap-3">
        {person?.image ? (
          <img
            src={person.image}
            alt=""
            className="h-[34px] w-[34px] shrink-0 rounded-prism-8 object-cover"
          />
        ) : (
          <NameTile />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-prism-label font-semibold text-prism-ink">
            {person ? person.name : label ? formatRnsName(label, chainId) : shortAddress(address)}
          </p>
          <p className="truncate text-prism-meta text-prism-ink-2">
            {person ? `@${person.handle}` : label ? shortAddress(address) : "Wallet address"}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy wallet address"
          className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
        >
          <Copy aria-hidden className="h-[21px] w-[21px]" />
        </button>
      </div>
      {verified ? (
        <p className="flex items-start gap-2 text-prism-meta text-prism-ink">
          <ShieldCheck aria-hidden className="h-[18px] w-[18px] shrink-0 text-prism-nav" />
          <span>
            <b className="font-semibold">Verified owner.</b> Owner&apos;s ID checked by Authbase.
            {label && ` This name points to ${shortAddress(address)}.`}
          </span>
        </p>
      ) : (
        <p className="prism-notice flex items-start gap-2 text-prism-meta text-prism-ink">
          <AlertTriangle
            aria-hidden
            className="h-[18px] w-[18px] shrink-0 text-prism-warning-ink"
          />
          <span>
            <b className="font-bold text-prism-warning-ink">Not verified.</b>{" "}
            {ownerDiffers
              ? "This name points to a wallet that does not own it. Check with the owner before you send."
              : "Check with the owner before you send."}
          </span>
        </p>
      )}
    </div>
  );
}

function RequestRow({
  index,
  title,
  meta,
  status,
  skipped,
  hash,
  explorer,
  error,
  onRetry,
}: {
  index: number;
  title: string;
  meta: string;
  status: "idle" | "pending" | "success" | "error";
  skipped?: boolean;
  hash?: `0x${string}`;
  explorer?: string;
  error?: Error;
  onRetry: () => void;
}) {
  const declined = status === "error" && classifyTxError(error) === "rejected";
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-prism-meta font-bold",
            status === "success"
              ? "bg-prism-success text-white"
              : status === "error"
                ? "bg-prism-danger text-white"
                : "bg-white/90 text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]"
          )}
        >
          {status === "success" ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : status === "pending" ? (
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            index
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-prism-label font-semibold text-prism-ink">{title}</p>
          <p className="text-prism-meta text-prism-ink-2">
            {skipped ? "Already in place" : status === "pending" ? "Check your wallet" : meta}
          </p>
        </div>
        <TxLink explorer={explorer} hash={hash} />
      </div>
      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 pl-[38px]">
          <p className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
            <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
            {declined
              ? "You declined in your wallet. Nothing was sent."
              : "The transaction failed. The name did not move. The network fee may still be charged."}
          </p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Retry
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Screen Review 080 I07 to I13: Transfer in the value panel. Recipient (name
 * or address with the trust card), Review (only the effects that apply, the
 * required checkbox), Confirm in wallet (approve this one name, then
 * transfer, each request with its own state and Retry), then the result.
 */
export function TransferFlow({
  name,
  chainId,
  transfer,
  draft,
  setDraft,
  onClose,
  onTransferred,
  onChooseAnother,
}: {
  name: RnsNameState;
  chainId: number;
  transfer: ReturnType<typeof useTransferOwnership>;
  draft: TransferDraft;
  setDraft: (next: TransferDraft) => void;
  onClose: () => void;
  onTransferred: () => void;
  onChooseAnother: () => void;
}) {
  const fullName = formatRnsName(name.label, chainId);
  const { address, chain } = useAccount();
  const explorer = chain?.blockExplorers?.default?.url;
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const balance = useBalance({ address, chainId, query: { enabled: !!address } });
  const { profile } = useEditor();
  const gate = useNameFlowGate(name, chainId, { ownerOnly: true, verb: "transfer" });
  const recipient = useRecipient(draft.input, name.owner, fullName);
  const toSummary = useAddressSummary(draft.to?.address ?? null).data ?? null;
  const [agreed, setAgreed] = useState(false);
  const [wasPageName, setWasPageName] = useState(false);
  const inputId = useId();
  const helperId = useId();
  const errorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const isPageName = !!profile.revoName && parseRnsInput(profile.revoName, chainId) === name.label;
  const toTitle = draft.to
    ? (toSummary?.person?.name ??
      (draft.to.label ? formatRnsName(draft.to.label, chainId) : shortAddress(draft.to.address)))
    : "";

  useEffect(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [draft.step]);

  const run = async () => {
    if (!draft.to) return;
    setWasPageName(isPageName);
    setDraft({ ...draft, step: "confirm" });
    const result = await transfer.transferOwnership(name.label, draft.to.address);
    if (result.success) {
      setDraft({ ...draft, step: "result" });
      onTransferred();
    }
  };

  const approval = transfer.steps.approval;
  const move = transfer.steps.transfer;
  const pending = transfer.overallStatus === "pending";

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (draft.step === "result" && draft.to) {
    body = (
      <>
        <dl className="prism-slab divide-y divide-prism-line">
          <div className="flex min-h-commit items-center gap-2 px-4 py-2">
            <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
            <p className="text-[20px] font-bold leading-[23px] text-prism-success">
              <span className="break-all">{fullName}</span> now belongs to {toTitle}
            </p>
          </div>
          <Row label="To">{shortAddress(draft.to.address)}</Row>
          <div className="flex min-h-touch flex-wrap items-center justify-between gap-2 px-4 py-1">
            <dt className="text-prism-label text-prism-ink-2">Transactions</dt>
            <dd className="flex flex-wrap justify-end">
              {approval.hash && <TxLink explorer={explorer} hash={approval.hash} />}
              <TxLink explorer={explorer} hash={move.hash} />
            </dd>
          </div>
        </dl>
        {wasPageName && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-prism-body text-prism-ink">Your page no longer shows an RNS name.</p>
            <Button type="button" variant="ghost" onClick={onChooseAnother}>
              Choose another
            </Button>
          </div>
        )}
      </>
    );
    footer = (
      <>
        <TestnetLine />
        <Button type="button" size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      </>
    );
  } else if (gate && draft.step !== "confirm") {
    body = gate.body;
    footer = gate.footer;
  } else if (draft.step === "recipient") {
    const state = recipient.state;
    const error = state.kind === "error" ? state.message : null;
    body = (
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-prism-label font-bold text-prism-ink">
          To
        </label>
        <p id={helperId} className="text-prism-meta text-prism-ink-2">
          RNS name or wallet address
        </p>
        <div
          className={cn(
            "prism-well flex h-touch items-center gap-2 px-3 focus-within:shadow-[inset_0_0_0_1.5px_#0B5A80,0_0_0_4px_rgba(39,170,225,0.32)]",
            error && "shadow-[inset_0_0_0_1.5px_#B3261E]"
          )}
        >
          <input
            id={inputId}
            value={draft.input}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={event => setDraft({ ...draft, input: event.target.value, to: null })}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${helperId}${error ? ` ${errorId}` : ""}`}
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink focus:outline-none"
          />
          {state.kind === "checking" && (
            <LoaderCircle
              aria-hidden
              className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-ink-3 motion-reduce:animate-none"
            />
          )}
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-prism-meta text-prism-danger"
          >
            <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
            {error}
          </p>
        )}
        {state.kind === "ok" && (
          <>
            {state.label && (
              <p className="text-prism-meta tabular-nums text-prism-ink-2">
                Resolves to {shortAddress(state.address)}
              </p>
            )}
            <RecipientTrustCard
              address={state.address}
              label={state.label}
              chainId={chainId}
              summary={recipient.summary}
              ownerDiffers={state.ownerDiffers}
            />
          </>
        )}
      </div>
    );
    footer = (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={state.kind !== "ok"}
          onClick={() => {
            if (state.kind !== "ok") return;
            setAgreed(false);
            transfer.resetSteps();
            setDraft({
              ...draft,
              step: "review",
              to: { address: state.address, label: state.label },
            });
          }}
        >
          Review
        </Button>
      </>
    );
  } else if (draft.step === "review" && draft.to) {
    body = (
      <>
        <dl className="prism-slab divide-y divide-prism-line">
          <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
            <dt className="text-prism-label text-prism-ink-2">To</dt>
            <dd className="min-w-0 text-right">
              <span className="block truncate text-prism-label font-semibold text-prism-ink">
                {toTitle}
              </span>
              <span className="block text-prism-meta tabular-nums text-prism-ink-2">
                {draft.to.label && toSummary?.person
                  ? `${formatRnsName(draft.to.label, chainId)} · `
                  : ""}
                {shortAddress(draft.to.address)}
              </span>
            </dd>
          </div>
          <Row label="Network fee">Shown in your wallet for each request</Row>
          <Row label="Available">
            {balance.data ? `${formatRnsAmount(balance.data.value)} ${symbol}` : "Loading"}
          </Row>
        </dl>
        <Notice variant="warning" title="This cannot be undone.">
          After the transfer you no longer own {fullName}.
          {isPageName && " Your page stops showing it."}
          {name.isPrimary && " It stops being your primary RNS name."}
        </Notice>
        <TestnetLine />
        <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
          I understand {toTitle} gets full control of {fullName}.{" "}
          <span className="text-prism-ink-2">(Required)</span>
        </Checkbox>
      </>
    );
    footer = (
      <>
        <CommitAction disabled={!agreed} onClick={() => void run()}>
          <Send aria-hidden />
          Transfer <span className="truncate">{fullName}</span>
        </CommitAction>
        <p className="text-center text-prism-meta text-prism-ink-2">
          Your wallet asks twice: approve this name only, then transfer. If the approval is already
          in place, it asks once.
        </p>
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft({ ...draft, step: "recipient" })}
          >
            Back
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <ol aria-live="polite" className="prism-slab divide-y divide-prism-line">
          <RequestRow
            index={1}
            title={`Approve ${fullName} only`}
            meta="Your other RNS names stay untouched."
            status={approval.status}
            skipped={approval.skipped}
            hash={approval.hash}
            explorer={explorer}
            error={approval.error}
            onRetry={() => void run()}
          />
          <RequestRow
            index={2}
            title={`Transfer to ${toTitle}`}
            meta={`Sends ${fullName} to ${toTitle}.`}
            status={move.status}
            hash={move.hash}
            explorer={explorer}
            error={move.error}
            onRetry={() => void run()}
          />
        </ol>
        <p className="text-prism-meta text-prism-ink-2">
          The transfer continues if you close this panel. Reopen Transfer on this name to see its
          progress.
        </p>
      </>
    );
    footer = pending ? (
      <Button type="button" size="lg" className="w-full" disabled>
        <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
        Waiting for your wallet
      </Button>
    ) : (
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDraft({ ...draft, step: "review" })}
        >
          Back
        </Button>
      </div>
    );
  }

  const current =
    draft.step === "result" ? 3 : draft.step === "confirm" ? 2 : draft.step === "review" ? 1 : 0;
  return (
    <SidePanel
      open
      onOpenChange={next => {
        if (!next) onClose();
      }}
      eyebrow="Transfer an RNS name"
      title={<RnsName label={name.label} chainId={chainId} />}
      byline={draft.to ? `To ${toTitle} · ${shortAddress(draft.to.address)}` : undefined}
      art={<NameTile src={name.records.avatar} size={55} />}
      calm={draft.step !== "recipient"}
      footer={footer}
    >
      <h3 ref={headingRef} tabIndex={-1} className="sr-only">
        {draft.step === "result" ? `${fullName} transferred` : `Step ${current + 1} of 3`}
      </h3>
      <StepBar steps={STEPS} current={current} />
      {body}
    </SidePanel>
  );
}
