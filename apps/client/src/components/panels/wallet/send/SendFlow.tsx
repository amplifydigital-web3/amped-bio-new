import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { formatEther, parseEther } from "viem";
import { useChainId, useFeeData, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { ArrowRight, Copy, ExternalLink, Loader2, Send, Wallet } from "lucide-react";
import { getChainConfig, getCurrencySymbol } from "@repo/web3";
import {
  AmountPresets,
  AmountWell,
  Button,
  Checkbox,
  CommitAction,
  ErrorCard,
  SidePanel,
  StepBar,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useWalletContext } from "@/contexts/WalletContext";
import { ComplianceCard, Slab, SlabRow, TestnetLine } from "../../explore/pool-panel/sections";
import {
  classifyTxError,
  formatExactAmount,
  formatTokenAmount,
  limitDecimals,
  presetAmount,
  toDecimal,
} from "../../explore/pool-panel/format";
import { ReconnectCard } from "./ReconnectCard";
import { RecipientAvatar, RecipientPicker } from "./RecipientPicker";
import { ScanQr, useHasCamera } from "./ScanQr";
import { recipientLine, recipientTitle, sameAddress, shortAddress, type Recipient } from "./model";
import { useRecentRecipients } from "./useRecentRecipients";
import { TrustCard, TrustChip } from "./TrustCard";
import { useRecipientTrust } from "./useRecipientTrust";

type Step = "select" | "scan" | "review" | "confirm" | "result" | "failed";

// D23: the first step names the input, then Review, then Confirm in wallet
const STEPS = ["Amount", "Review", "Confirm in wallet"];
// Standard native transfer
const TRANSFER_GAS = 21_000n;

function failureCause(error: unknown) {
  if (classifyTxError(error) === "rejected") return "You cancelled in your wallet. Nothing moved.";
  const message = (error as { message?: string } | null)?.message ?? "";
  if (/insufficient funds/i.test(message)) {
    return "Not enough tREVO for the amount plus the network fee.";
  }
  return "The network did not accept the send. Nothing moved.";
}

/**
 * Screen Review 062 to 064: Send is a money flow inside Wallet (D05, D12).
 * Wallet Send and /pay open it at /wallet?send=1. Select chooses the person
 * and the amount, Review shows every figure with the compliance card and the
 * acknowledgement, then the wallet confirms. 063 D1: while the live wallet is
 * not connected, search still works and Review send becomes the reconnect
 * card.
 */
export default function SendFlow() {
  const [params, setParams] = useSearchParams();
  const open = params.get("send") === "1";
  const wallet = useWalletContext();
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const chain = getChainConfig(chainId);
  const symbol = getCurrencySymbol(chainId);
  const hasCamera = useHasCamera();
  const inputRef = useRef<HTMLInputElement>(null);
  const scanButtonFocus = useRef(false);

  const [step, setStep] = useState<Step>("select");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [cause, setCause] = useState("");

  const recent = useRecentRecipients(wallet.address, chainId, open);
  // 110 I01: Send opens with a recipient from /wallet?send=1&to=<name or address>
  const toParam = params.get("to") ?? "";
  // 110 I03: the same trust read the card uses, for the Review chip
  const trustQuery = recipient ? (recipient.rnsName ?? recipient.address) : null;
  const trust = useRecipientTrust(open ? trustQuery : null);
  const resolvedTrust = trust.data?.status === "ok" ? trust.data : null;
  const { data: feeData } = useFeeData({ query: { enabled: open } });
  const send = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({
    hash: send.data,
    query: { enabled: !!send.data },
  });

  const balanceText = wallet.balance?.data?.formatted ?? "0";
  const balanceDec = useMemo(() => new Decimal(balanceText), [balanceText]);
  const gasPrice = feeData?.gasPrice ?? feeData?.maxFeePerGas;
  // Shown fees round up to 4 decimals, so Total is never less than the real cost
  const feeDec = gasPrice
    ? new Decimal(formatEther(gasPrice * TRANSFER_GAS)).toDecimalPlaces(4, Decimal.ROUND_UP)
    : null;
  const amountDec = toDecimal(amount);
  const maxDec = Decimal.max(0, balanceDec.minus(feeDec ?? 0));

  // 064 I06: one error, named by the fix
  const amountError = useMemo(() => {
    if (!amountDec) return undefined;
    if ((amount.split(".")[1] ?? "").length > 18) return "Use up to 18 decimal places.";
    if (amountDec.lte(0)) return "Enter an amount above 0.";
    if (amountDec.gt(balanceDec)) {
      return `More than your available ${formatTokenAmount(balanceDec)} ${symbol}.`;
    }
    if (feeDec && amountDec.plus(feeDec).gt(balanceDec)) {
      return `Leave about ${formatTokenAmount(feeDec)} ${symbol} for the network fee.`;
    }
    return undefined;
  }, [amount, amountDec, balanceDec, feeDec, symbol]);
  const amountReady = !!recipient && !!amountDec && amountDec.gt(0) && !amountError;

  const reset = () => {
    setStep("select");
    setRecipient(null);
    setQuery("");
    setAmount("");
    setAgreed(false);
    setCause("");
    send.reset();
  };

  const close = () => {
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("send");
        next.delete("to");
        return next;
      },
      { replace: true }
    );
    reset();
  };

  // Receipt: the result, or the failed card on Review
  useEffect(() => {
    if (step !== "confirm" || !send.data) return;
    if (receipt.isSuccess) {
      if (receipt.data.status === "success") {
        setStep("result");
        wallet.updateBalanceDelayed();
        void queryClient.invalidateQueries({ queryKey: ["send", "recent-recipients"] });
      } else {
        setCause(
          "The send did not go through. The amount did not move. The network fee may still be charged."
        );
        setStep("failed");
      }
    } else if (receipt.isError) {
      // The wallet already broadcast the tx — keep polling, don't offer Retry
      setCause(
        "The send could not be confirmed yet. Check your wallet or the explorer for the transaction."
      );
      setStep("failed");
    }
  }, [step, send.data, receipt.isSuccess, receipt.isError, receipt.data, wallet, queryClient]);

  // 062 I02: the To field takes focus when the panel opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  // Focus returns to the Scan button after a scan is cancelled
  useEffect(() => {
    if (step === "select" && scanButtonFocus.current) {
      scanButtonFocus.current = false;
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('[aria-label="Scan a QR code"]')?.focus()
      );
    }
  }, [step]);

  const commit = async () => {
    if (!recipient || !amountDec) return;
    setStep("confirm");
    try {
      await send.sendTransactionAsync({
        to: recipient.address,
        value: parseEther(amountDec.toFixed()),
      });
    } catch (error) {
      setCause(failureCause(error));
      setStep("failed");
    }
  };

  const copyAddress = async () => {
    if (!recipient) return;
    try {
      await navigator.clipboard.writeText(recipient.address);
      toast.add({ type: "success", title: "Address copied" });
    } catch {
      toast.add({ type: "error", title: "Copy failed. Select the address and copy it manually." });
    }
  };

  const signing = step === "confirm";
  const stepIndex =
    step === "review" || step === "failed" ? 1 : step === "confirm" ? 2 : step === "result" ? 3 : 0;
  const amountText = amountDec ? formatExactAmount(amountDec) : "0";
  const totalDec = amountDec && feeDec ? amountDec.plus(feeDec) : null;
  const afterDec = Decimal.max(0, balanceDec.minus(totalDec ?? amountDec ?? 0));
  const explorer = chain?.blockExplorers?.default.url;

  const title =
    step === "scan"
      ? "Scan a QR code"
      : recipient
        ? recipientTitle(recipient)
        : "Choose a recipient";
  const art = recipient ? (
    <RecipientAvatar recipient={recipient} className="h-full w-full !rounded-prism-13" />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-prism-value-panel-2">
      <Send aria-hidden className="h-[21px] w-[21px] text-prism-value-ink" />
    </span>
  );

  const toRow = recipient && (
    <span className="flex min-w-0 items-center justify-end gap-2">
      <RecipientAvatar recipient={recipient} />
      <span className="min-w-0 text-right">
        <span className="flex items-center justify-end gap-1.5">
          <span className="truncate text-prism-label font-semibold text-prism-ink">
            {recipientTitle(recipient)}
          </span>
          <TrustChip trust={resolvedTrust} />
        </span>
        <span className="block truncate text-prism-meta font-normal tabular-nums text-prism-ink-2">
          {recipientLine(recipient)}
        </span>
      </span>
    </span>
  );

  const feeText = feeDec ? `about ${formatTokenAmount(feeDec)} ${symbol}` : "Calculating";

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (step === "scan") {
    body = (
      <ScanQr
        onScan={address => {
          setRecipient({ address });
          setStep("select");
          // Person first: match the scanned address to a member
          void queryClient
            .fetchQuery({
              queryKey: ["send", "member", address.toLowerCase()],
              queryFn: () => trpcClient.wallet.getUserByAddress.query({ address }),
            })
            .then(member => {
              if (member) {
                setRecipient(current =>
                  sameAddress(current?.address, address)
                    ? {
                        address,
                        name: member.name,
                        handle: member.handle,
                        avatar: member.image,
                      }
                    : current
                );
              }
            })
            .catch(() => undefined);
        }}
        onCancel={() => {
          scanButtonFocus.current = true;
          setStep("select");
        }}
        onPaste={() => {
          setStep("select");
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      />
    );
    footer = <TestnetLine />;
  } else if (step === "select" && !recipient) {
    body = (
      <RecipientPicker
        ownAddress={wallet.address}
        initialQuery={query || toParam}
        recent={{
          data: recent.data,
          isPending: recent.isPending,
          isError: recent.isError,
          refetch: () => void recent.refetch(),
          enabled: !!wallet.address && !!chain?.blockExplorers?.default.apiUrl,
        }}
        hasCamera={hasCamera}
        inputRef={inputRef}
        onScan={() => setStep("scan")}
        onSelect={(next, typed) => {
          setQuery(typed);
          setRecipient(next);
        }}
      />
    );
    footer = <TestnetLine />;
  } else if (step === "select" && recipient) {
    body = (
      <>
        {/* 062 I08: the chosen person, locked, with Change */}
        <div className="prism-slab flex min-h-commit items-center gap-3 !rounded-prism-21 px-4 py-2">
          <RecipientAvatar recipient={recipient} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-prism-label font-semibold text-prism-ink">
              {recipientTitle(recipient)}
            </p>
            <p className="truncate text-prism-meta tabular-nums text-prism-ink-2">
              {recipientLine(recipient)}
            </p>
          </div>
          {recipient.handle && (
            <Button asChild variant="ghost" size="icon" className="!rounded-full">
              <a
                href={`${import.meta.env.VITE_LANDINGPAGE_URL}/${recipient.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${recipientTitle(recipient)}'s page (opens in a new tab)`}
              >
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setRecipient(null);
              setAmount("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Change
          </Button>
        </div>
        <TrustCard query={trustQuery} />
        <AmountWell
          label="Amount"
          value={amount}
          onChange={next => setAmount(limitDecimals(next))}
          unit={symbol}
          available={
            <>
              Available{" "}
              <span className="font-semibold">
                {formatTokenAmount(balanceDec)} {symbol}
              </span>
            </>
          }
          balanceAfter={`Balance after ${formatTokenAmount(afterDec)} ${symbol}`}
          error={amountError}
        />
        <AmountPresets
          presets={[
            { label: "25%", value: presetAmount(maxDec, 0.25) },
            { label: "50%", value: presetAmount(maxDec, 0.5) },
            { label: "75%", value: presetAmount(maxDec, 0.75) },
            { label: feeDec ? "Max" : "Calculating", value: presetAmount(maxDec, 1) },
          ]}
          onPick={setAmount}
        />
      </>
    );
    footer = wallet.isWeb3Wallet ? (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!amountReady}
          onClick={() => {
            setAgreed(false);
            setStep("review");
          }}
        >
          Review send
          <ArrowRight aria-hidden />
        </Button>
      </>
    ) : (
      // 063 D1: the reconnect card takes the place of Review send, in the body so
      // the amount stays in view
      <TestnetLine />
    );
    if (!wallet.isWeb3Wallet) {
      body = (
        <>
          {body}
          <ReconnectCard />
        </>
      );
    }
  } else if (step === "result" && recipient) {
    body = (
      <div className="space-y-[21px]" aria-live="polite">
        <h3 className="text-prism-panel-title text-prism-ink">
          Sent {amountText} {symbol} to {recipientTitle(recipient)}
          {recipient.rnsName && recipientTitle(recipient) !== recipient.rnsName
            ? ` (${recipient.rnsName})`
            : ""}
        </h3>
        <Slab>
          <SlabRow label="You sent" value={`${amountText} ${symbol}`} />
          <SlabRow label="To" value={toRow} />
        </Slab>
        {explorer && send.data && (
          <Button asChild variant="ghost" className="-ml-3">
            <a href={`${explorer}/tx/${send.data}`} target="_blank" rel="noopener noreferrer">
              View transaction
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
      </div>
    );
    footer = (
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
        Done
      </Button>
    );
  } else if (recipient) {
    // Review, Confirm in wallet and the failed card share the calm commit state
    body = (
      <>
        {step === "confirm" ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center" aria-live="polite">
            <span className="prism-disc" aria-hidden>
              <Wallet className="h-[34px] w-[34px] text-prism-value-ink" strokeWidth={1.5} />
            </span>
            <h3 className="text-prism-panel-title text-prism-ink">Confirm in your wallet</h3>
            <p className="text-prism-body text-prism-ink-2">
              Approve the send in your wallet to continue.
            </p>
          </div>
        ) : (
          <AmountWell
            label="You send"
            value={amountText}
            unit={symbol}
            calm
            onEdit={() => setStep("select")}
          />
        )}
        {step === "failed" && (
          <ErrorCard
            title="Send did not go through"
            cause={cause}
            onRetry={
              // Receipt errors: tx already broadcast, keep polling, don't offer Retry
              receipt.isError && send.data
                ? undefined
                : () => {
                    send.reset();
                    setStep("review");
                  }
            }
            retryLabel={receipt.isError && send.data ? undefined : "Retry"}
          />
        )}
        {/* Show explorer link for receipt errors — the tx was broadcast */}
        {step === "failed" && receipt.isError && send.data && explorer && (
          <Button asChild variant="ghost" className="-ml-3">
            <a href={`${explorer}/tx/${send.data}`} target="_blank" rel="noopener noreferrer">
              View transaction
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
        <Slab>
          {step === "confirm" ? (
            <SlabRow label="You send" value={`${amountText} ${symbol}`} />
          ) : (
            <SlabRow
              label="Asset and network"
              value={`${symbol} on ${chain?.name ?? "the network"}`}
            />
          )}
          <SlabRow
            label="To"
            value={
              <span className="flex items-center justify-end gap-1">
                {toRow}
                {step !== "confirm" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Copy address ${shortAddress(recipient.address)}`}
                    onClick={() => void copyAddress()}
                  >
                    <Copy aria-hidden />
                  </Button>
                )}
              </span>
            }
          />
          <SlabRow label="Network fee" value={feeText} />
          <SlabRow
            label="Total"
            value={totalDec ? `${formatExactAmount(totalDec)} ${symbol}` : "Calculating"}
          />
          {step !== "confirm" && (
            <SlabRow label="Balance after" value={`${formatTokenAmount(afterDec)} ${symbol}`} />
          )}
        </Slab>
        {step === "confirm" ? (
          <div className="prism-slab flex min-h-commit items-center gap-3 !rounded-prism-21 px-4">
            <Loader2
              aria-hidden
              className="h-[21px] w-[21px] text-prism-nav motion-safe:animate-spin"
            />
            <span className="flex-1 text-prism-label font-semibold text-prism-ink">
              {send.data ? "Submitting" : "Waiting for your signature"}
            </span>
            <span className="text-prism-meta text-prism-ink-2">Close is off while signing</span>
          </div>
        ) : (
          <>
            <ComplianceCard />
            {/* 064 D1, approved as written */}
            <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
              I understand sends are final and cannot be reversed. (Required)
            </Checkbox>
          </>
        )}
        {step === "failed" && (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 self-start"
            onClick={() => setStep("select")}
          >
            Edit send
          </Button>
        )}
      </>
    );
    footer = (
      <>
        {step === "confirm" && <TestnetLine />}
        {wallet.isWeb3Wallet ? (
          <CommitAction
            disabled={signing || !agreed || !amountReady}
            aria-busy={signing}
            onClick={() => void commit()}
          >
            {signing ? (
              <Loader2 aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <Send aria-hidden />
            )}
            Send {amountText} {symbol}
          </CommitAction>
        ) : (
          <ReconnectCard />
        )}
      </>
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={next => {
        if (!next) close();
      }}
      calm={step === "review" || step === "confirm" || step === "failed" || step === "result"}
      dismissible={!signing && step !== "scan"}
      eyebrow="Send to"
      title={title}
      byline={recipient && step !== "scan" ? recipientLine(recipient) : undefined}
      art={art}
      footer={footer}
    >
      <StepBar steps={STEPS} current={stepIndex} />
      {body}
    </SidePanel>
  );
}
