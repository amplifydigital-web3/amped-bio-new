import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  ArrowRight,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Wallet,
} from "lucide-react";
import { USDC_COPY, type UsdcClientFailure, type UsdcSendRefusal } from "@repo/constants";
import { USDC_DECIMALS, USDC_SYMBOL, formatUsdc, getCurrencySymbol, parseUsdc } from "@repo/web3";
import {
  AmountPresets,
  AmountWell,
  Button,
  Checkbox,
  CommitAction,
  ErrorCard,
  Notice,
  SidePanel,
  StepBar,
  trpc,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useWalletContext } from "@/contexts/WalletContext";
import { appChainId } from "@/utils/appChain";
import { paymentChain } from "@/utils/paymentChain";
import { Slab, SlabRow } from "../../explore/pool-panel/sections";
import { useUsdcBalance } from "../hooks/useUsdcBalance";
import { AssetChips } from "./AssetChips";
import { ReconnectCard } from "./ReconnectCard";
import { RecipientAvatar, RecipientPicker } from "./RecipientPicker";
import { recipientLine, recipientTitle, shortAddress, type Recipient } from "./model";
import { classifyUsdcSignError, useUsdcSigner, type UsdcTypedData } from "./useUsdcSigner";
import { SignOutAndBackButton } from "./SignOutAndBackButton";

// These causes cannot be fixed by signing again in this session
const NO_RETRY_FAILURES: ReadonlySet<UsdcClientFailure> = new Set([
  "wallet_mismatch",
  "signer_changed",
  "wallet_disconnected",
]);

type Step = "select" | "review" | "confirm" | "result" | "refused" | "failed";

// D23: the first step names the input, then Review, then Confirm in wallet
const STEPS = ["Amount", "Review", "Confirm in wallet"];
const PRESETS = ["10", "25", "50"];

type Prepared = {
  sendId: string;
  typedData: UsdcTypedData;
  amount: bigint;
};

function txUrl(hash: string) {
  const explorer = paymentChain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : null;
}

function serverMessage(error: unknown) {
  const message = (error as { message?: string } | null)?.message;
  return message && message.length < 160 ? message : "The send did not start. Nothing moved.";
}

/**
 * Screen Review 137, boards w3, w4 and w6 (spec 3.6). The gasless USDC send at
 * /wallet?send=usdc. Amount chooses the person and the amount; Review send
 * asks the server to check limits and screen both addresses before anything
 * is signed; Review shows every figure and the required acknowledgement; the
 * commit signs an EIP-3009 authorization on Base and the CDP relayer submits
 * it, so the fan pays no network fee and needs no ETH. A refusal is final and
 * shows one line and Done.
 */
export default function UsdcSendFlow() {
  const [params, setParams] = useSearchParams();
  const open = params.get("send") === "usdc";
  const wallet = useWalletContext();
  const queryClient = useQueryClient();
  const sign = useUsdcSigner();
  const inputRef = useRef<HTMLInputElement>(null);
  const balance = useUsdcBalance(open ? wallet.address : undefined);

  const [step, setStep] = useState<Step>("select");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [refusal, setRefusal] = useState<UsdcSendRefusal | null>(null);
  const [cause, setCause] = useState("");
  const [canRetry, setCanRetry] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [clientFailure, setClientFailure] = useState<UsdcClientFailure | null>(null);

  const prepare = useMutation(trpc.usdc.send.prepare.mutationOptions());
  const submit = useMutation(trpc.usdc.send.submit.mutationOptions());
  const abandon = useMutation(trpc.usdc.send.abandon.mutationOptions());
  const status = useQuery({
    ...trpc.usdc.send.status.queryOptions({ sendId: prepared?.sendId ?? "" }),
    enabled: step === "result" && !!prepared && !!txHash,
    refetchInterval: query => {
      const current = query.state.data?.status;
      return current === "confirmed" || current === "failed" ? false : 3_000;
    },
  });

  const toParam = params.get("to") ?? "";
  const units = parseUsdc(amount);
  const available = balance.data ?? 0n;
  const nativeSymbol = getCurrencySymbol(Number(appChainId()));

  // 064 I06: one error, named by the fix
  const amountError = useMemo(() => {
    if (!amount.trim()) return undefined;
    if ((amount.split(".")[1] ?? "").length > USDC_DECIMALS) return "Use up to 6 decimal places.";
    if (units === null) return "Enter an amount above 0.";
    if (balance.data !== undefined && units > available) {
      return `More than your available ${formatUsdc(available, 4)} ${USDC_SYMBOL}.`;
    }
    return undefined;
  }, [amount, units, available, balance.data]);
  const amountReady = !!recipient && units !== null && !amountError && balance.data !== undefined;
  const sentUnits = prepared?.amount ?? units ?? 0n;
  const after = available > sentUnits ? available - sentUnits : 0n;

  const reset = () => {
    setStep("select");
    setRecipient(null);
    setQuery("");
    setAmount("");
    setAgreed(false);
    setPrepared(null);
    setRefusal(null);
    setCause("");
    setCanRetry(true);
    setTxHash(null);
    setSigned(false);
    setClientFailure(null);
    prepare.reset();
    submit.reset();
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

  // The To field takes focus when the panel opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  // A confirmed send updates the tile and Activity without a reload (acceptance 3)
  const finalStatus = status.data?.status;
  useEffect(() => {
    if (finalStatus === "confirmed" || finalStatus === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      void queryClient.invalidateQueries({ queryKey: trpc.usdc.activity.queryKey() });
    }
  }, [finalStatus, queryClient]);

  const review = async () => {
    if (!recipient || units === null) return;
    try {
      const result = await prepare.mutateAsync({
        to: recipient.address,
        amount: amount.trim(),
        // The server refuses when the live wallet is not this account's wallet
        signer: wallet.liveAddress,
      });
      if (result.refused) {
        setRefusal(result.reason);
        setStep("refused");
        return;
      }
      setPrepared({ sendId: result.sendId, typedData: result.typedData, amount: units });
      setAgreed(false);
      setStep("review");
    } catch (error) {
      setCause(serverMessage(error));
      setCanRetry(true);
      setStep("failed");
    }
  };

  const commit = async () => {
    if (!prepared) return;
    setStep("confirm");
    setSigned(false);
    setClientFailure(null);
    let signature: `0x${string}`;
    try {
      signature = await sign(prepared.typedData);
    } catch (error) {
      const code = classifyUsdcSignError(error);
      console.warn(`[usdc-send] send stopped before submit: ${code}`, error);
      // Must have 3: the row leaves `screened` and Admin, Money shows the cause.
      // Reporting is best effort; the fan sees the result either way.
      abandon.mutate({ sendId: prepared.sendId, code });
      setClientFailure(code);
      setCause(USDC_COPY.clientFailure[code]);
      const retry = !NO_RETRY_FAILURES.has(code);
      setCanRetry(retry);
      // The old authorization is closed; Retry goes back to Amount for a new Review
      if (retry) setPrepared(null);
      setStep("failed");
      return;
    }
    setSigned(true);
    try {
      const result = await submit.mutateAsync({ sendId: prepared.sendId, signature });
      if (result.refused) {
        setRefusal(result.reason);
        setStep("refused");
        return;
      }
      if (result.status === "failed") {
        setCause("The send did not go through. Nothing moved.");
        // The same authorization would fail again; start over from Amount
        setCanRetry(false);
        setStep("failed");
        return;
      }
      setTxHash(result.txHash);
      setStep("result");
      void queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
    } catch (error) {
      setCause(serverMessage(error));
      setCanRetry(false);
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
    step === "review" || step === "failed" || step === "refused"
      ? 1
      : step === "confirm"
        ? 2
        : step === "result"
          ? 3
          : 0;
  const amountText = formatUsdc(sentUnits, 4);
  const confirmed = finalStatus === "confirmed";
  const link = txHash ? txUrl(txHash) : null;

  const toRow = recipient && (
    <span className="flex min-w-0 items-center justify-end gap-2">
      <RecipientAvatar recipient={recipient} />
      <span className="min-w-0 text-right">
        <span className="block truncate text-prism-label font-semibold text-prism-ink">
          {recipientTitle(recipient)}
        </span>
        <span className="block truncate text-prism-meta font-normal tabular-nums text-prism-ink-2">
          {recipientLine(recipient)}
        </span>
      </span>
    </span>
  );

  const title = recipient ? recipientTitle(recipient) : "Choose a recipient";
  const art = recipient ? (
    <RecipientAvatar recipient={recipient} className="h-full w-full !rounded-prism-13" />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-prism-value-panel-2">
      <CircleDollarSign aria-hidden className="h-[21px] w-[21px] text-prism-value-ink" />
    </span>
  );

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === "select" && !recipient) {
    body = (
      <>
        <AssetChips current="usdc" nativeSymbol={nativeSymbol} />
        <RecipientPicker
          ownAddress={wallet.address}
          initialQuery={query || toParam}
          // Recent recipients come from the Libertas explorer, so USDC starts without them
          recent={{
            data: undefined,
            isPending: false,
            isError: false,
            refetch: () => undefined,
            enabled: false,
          }}
          hasCamera={false}
          inputRef={inputRef}
          onScan={() => undefined}
          onSelect={(next, typed) => {
            setQuery(typed);
            setRecipient(next);
          }}
        />
      </>
    );
  } else if (step === "select" && recipient) {
    const maxValue = formatUnits(available, USDC_DECIMALS);
    body = (
      <>
        <AssetChips current="usdc" nativeSymbol={nativeSymbol} />
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
        <AmountWell
          label="Amount"
          value={amount}
          onChange={setAmount}
          unit={USDC_SYMBOL}
          available={
            <>
              Available{" "}
              <span className="font-semibold">
                {balance.data === undefined
                  ? "Loading"
                  : `${formatUsdc(available, 4)} ${USDC_SYMBOL}`}
              </span>
            </>
          }
          balanceAfter={`Balance after ${formatUsdc(after, 4)} ${USDC_SYMBOL}`}
          error={amountError}
        />
        <AmountPresets
          presets={[
            ...PRESETS.map(value => ({ label: value, value })),
            { label: "Max", value: maxValue },
          ]}
          onPick={setAmount}
        />
        <Slab>
          <SlabRow label="Network" value={paymentChain.name} />
          <SlabRow label="Network fee" value="Paid by Amped.Bio" />
        </Slab>
      </>
    );
    if (!wallet.isWeb3Wallet) {
      body = (
        <>
          {body}
          <ReconnectCard />
        </>
      );
    } else {
      footer = (
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!amountReady || prepare.isPending}
          aria-busy={prepare.isPending || undefined}
          onClick={() => void review()}
        >
          {prepare.isPending ? "Checking" : "Review send"}
          {prepare.isPending ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <ArrowRight aria-hidden />
          )}
        </Button>
      );
    }
  } else if (step === "refused" && refusal) {
    body = (
      <div className="space-y-[21px]" aria-live="polite">
        <Notice variant="warning" title={USDC_COPY.refusal[refusal]} />
        {recipient && (
          <Slab>
            <SlabRow label="To" value={toRow} />
          </Slab>
        )}
      </div>
    );
    footer = (
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={close}>
        Done
      </Button>
    );
  } else if (step === "result" && recipient) {
    body = (
      <div className="space-y-[21px]" aria-live="polite">
        <h3 className="text-prism-panel-title text-prism-ink">
          Sent {amountText} {USDC_SYMBOL} to {recipientTitle(recipient)}
        </h3>
        <Slab>
          <SlabRow label="You sent" value={`${amountText} ${USDC_SYMBOL}`} />
          <SlabRow label="To" value={toRow} />
          <SlabRow label="Network fee" value="Paid by Amped.Bio" />
          <SlabRow
            label="Status"
            value={
              confirmed
                ? `Confirmed on ${paymentChain.name}`
                : finalStatus === "failed"
                  ? "Did not go through. Nothing moved."
                  : `Confirming on ${paymentChain.name}`
            }
          />
        </Slab>
        {link && (
          <Button asChild variant="ghost" className="-ml-3">
            <a href={link} target="_blank" rel="noopener noreferrer">
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
              Sign the send in your wallet. There is no network fee to pay.
            </p>
          </div>
        ) : (
          <AmountWell
            label="You send"
            value={amountText}
            unit={USDC_SYMBOL}
            calm
            onEdit={() => {
              setPrepared(null);
              setStep("select");
            }}
          />
        )}
        {step === "failed" && (
          <ErrorCard
            title="Send did not go through"
            cause={cause}
            onRetry={
              canRetry
                ? () => {
                    setCause("");
                    setStep(prepared ? "review" : "select");
                  }
                : undefined
            }
            retryLabel={canRetry ? "Retry" : undefined}
          />
        )}
        <Slab>
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
          <SlabRow label="Network" value={paymentChain.name} />
          <SlabRow label="Network fee" value="Paid by Amped.Bio" />
          {step !== "confirm" && (
            <SlabRow label="Balance after" value={`${formatUsdc(after, 4)} ${USDC_SYMBOL}`} />
          )}
          <SlabRow label="Arrives" value="In about 30 seconds" />
        </Slab>
        {step === "confirm" ? (
          <div className="prism-slab flex min-h-commit items-center gap-3 !rounded-prism-21 px-4">
            <Loader2
              aria-hidden
              className="h-[21px] w-[21px] text-prism-nav motion-safe:animate-spin"
            />
            <span className="flex-1 text-prism-label font-semibold text-prism-ink">
              {signed ? "Submitting" : "Waiting for your signature"}
            </span>
            <span className="text-prism-meta text-prism-ink-2">Close is off while signing</span>
          </div>
        ) : step === "review" ? (
          <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
            I checked the address. Sends on {paymentChain.name} cannot be reversed. (Required)
          </Checkbox>
        ) : null}
        {step === "failed" &&
          (clientFailure === "wallet_mismatch" || clientFailure === "signer_changed") && (
            <SignOutAndBackButton />
          )}
        {step === "failed" && (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 self-start"
            onClick={() => {
              setPrepared(null);
              setStep("select");
            }}
          >
            Edit send
          </Button>
        )}
      </>
    );
    footer =
      step === "failed" ? null : wallet.isWeb3Wallet ? (
        <CommitAction
          disabled={signing || !agreed || !prepared}
          aria-busy={signing}
          onClick={() => void commit()}
        >
          {signing ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Send aria-hidden />
          )}
          Send {amountText} {USDC_SYMBOL}
        </CommitAction>
      ) : (
        <ReconnectCard />
      );
  } else {
    // A failure before a recipient was chosen cannot happen; keep the panel usable
    body = (
      <ErrorCard
        title="Send did not start"
        cause={cause}
        onRetry={reset}
        retryLabel="Start again"
      />
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={next => {
        if (!next) close();
      }}
      calm={step !== "select"}
      dismissible={!signing}
      eyebrow={`Send ${USDC_SYMBOL} to`}
      title={title}
      byline={recipient ? recipientLine(recipient) : `${USDC_SYMBOL} on ${paymentChain.name}`}
      art={art}
      footer={footer}
    >
      <StepBar steps={STEPS} current={stepIndex} />
      {body}
      {step === "select" && (
        <p className="font-prism text-prism-meta text-prism-ink-2">{USDC_COPY.feeLine}</p>
      )}
    </SidePanel>
  );
}
