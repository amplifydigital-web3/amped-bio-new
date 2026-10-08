import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, ExternalLink, Wallet } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createWalletClient, custom, parseEther, formatEther, type Address } from "viem";
import {
  Button,
  Checkbox,
  CommitAction,
  Notice,
  ReviewSlab,
  SidePanel,
  StepBar,
  TESTNET_NOTICE,
  WALLET_NOTE,
  trpc,
  trpcClient,
} from "@repo/ui";
import { NDAU_GROUP_LABELS } from "@repo/constants";
import { CopyButton } from "../../kit/CopyButton";
import { Spinner } from "../../kit/parts";
import { formatDayTime, shortHex } from "../../kit/format";
import {
  SEND_CHAIN,
  SEND_NETWORK,
  SEND_SYMBOL,
  clearUnrecordedTx,
  explorerTx,
  writeUnrecordedTx,
  type Conversion,
} from "./shared";

// Screen Review 089 I01 to I04. Process runs the money flow in the G3 value
// panel: Amount (the read only request with wallet and network checks), Review
// (calm commit state, exact slab, the solid compliance card, a required
// checkbox, Send with the wallet note), Confirm in wallet, then the result.
//
// The request is locked as processing on the server before this panel opens
// (#232, done by the caller). The hash is written to localStorage the moment
// the wallet returns it, then recorded on the server; if recording fails the
// panel shows Sent but not recorded and Send is never offered again.

type Step = "select" | "review" | "wallet" | "result";
const STEPS = ["Amount", "Review", "Confirm in wallet"];
const CHAIN_HEX = `0x${SEND_CHAIN.id.toString(16)}`;

function classifySendError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: number })?.code;
  if (code === 4001 || /user rejected|denied|cancel/i.test(text)) {
    return "You cancelled in your wallet. Nothing moved.";
  }
  if (/insufficient funds/i.test(text)) {
    return "The conversion wallet does not hold enough tREVO for this send and its fee. Nothing moved.";
  }
  return "The send did not go through. Nothing moved.";
}

export function ProcessPanel({
  conversion,
  onClose,
  onChanged,
}: {
  // The locked request, or null when the panel is closed
  conversion: Conversion | null;
  onClose: () => void;
  // Refetch the queue after a state change
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [fee, setFee] = useState<string>("Calculating");
  const [checked, setChecked] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentHash, setSentHash] = useState<string | null>(null);
  const [recordFailed, setRecordFailed] = useState(false);
  const openId = useRef<number | null>(null);

  const hasWallet = typeof window !== "undefined" && !!window.ethereum;
  const onChain = chainId?.toLowerCase() === CHAIN_HEX;

  // Reset for each request that opens
  useEffect(() => {
    if (!conversion || openId.current === conversion.id) return;
    openId.current = conversion.id;
    setStep("select");
    setAddress(null);
    setChainId(null);
    setWalletError(null);
    setChecked(false);
    setSendError(null);
    setSentHash(null);
    setRecordFailed(false);
    setFee("Calculating");
  }, [conversion]);

  // Keep the account and network current from wallet events
  useEffect(() => {
    if (!conversion || !window.ethereum) return;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list[0] ?? null);
    };
    const onChainChanged = (id: unknown) => setChainId(String(id));
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", onAccounts);
      window.ethereum?.removeListener("chainChanged", onChainChanged);
    };
  }, [conversion]);

  const record = useMutation({
    mutationFn: trpc.ndauConversion.confirmConversionTxid.mutationOptions().mutationFn,
    // A network blip must not leave a sent payment unrecorded. The server call is
    // idempotent for the same txid, so retrying is safe.
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    onSuccess: (_data, variables) => {
      clearUnrecordedTx(variables.id);
      setRecordFailed(false);
      setStep("result");
      toast.success(`Conversion #${variables.id} processed`);
      onChanged();
    },
    onError: (_error, variables) => {
      // The hash is already in localStorage. Never offer Send again.
      setRecordFailed(true);
      setStep("result");
      console.error("Failed to record conversion txid", { id: variables.id, txid: variables.txid });
      onChanged();
    },
  });

  if (!conversion) return null;

  const amount = conversion.revoAmount;
  const handle = conversion.user?.handle ? `@${conversion.user.handle}` : null;
  const sending = step === "wallet" && !sentHash;
  const busy = sending || record.isPending;

  const connect = async () => {
    if (!window.ethereum) return;
    setConnecting(true);
    setWalletError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const id = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ?? null);
      setChainId(id);
    } catch (error) {
      setWalletError(
        (error as { code?: number })?.code === 4001
          ? "You closed the wallet request. Connect again when ready."
          : "The wallet did not connect. Try again."
      );
    } finally {
      setConnecting(false);
    }
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    setSwitching(true);
    setWalletError(null);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
      setChainId(CHAIN_HEX);
    } catch (error) {
      if ((error as { code?: number })?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN_HEX,
                chainName: SEND_CHAIN.name,
                nativeCurrency: SEND_CHAIN.nativeCurrency,
                rpcUrls: SEND_CHAIN.rpcUrls.default.http,
                blockExplorerUrls: [SEND_CHAIN.blockExplorers.default.url],
              },
            ],
          });
          setChainId(CHAIN_HEX);
        } catch {
          setWalletError("Libertas Testnet was not added to the wallet. Try again.");
        }
      } else {
        setWalletError(
          "The wallet stayed on its network. Switch to Libertas Testnet and try again."
        );
      }
    } finally {
      setSwitching(false);
    }
  };

  const toReview = async () => {
    setStep("review");
    setChecked(false);
    setSendError(null);
    setFee("Calculating");
    try {
      const value = `0x${parseEther(amount).toString(16)}`;
      const [gas, price] = (await Promise.all([
        window.ethereum!.request({
          method: "eth_estimateGas",
          params: [{ from: address, to: conversion.revoAddress, value }],
        }),
        window.ethereum!.request({ method: "eth_gasPrice" }),
      ])) as [string, string];
      const total = BigInt(gas) * BigInt(price);
      setFee(
        `about ${Number(formatEther(total)).toLocaleString("en-US", { maximumSignificantDigits: 2 })} ${SEND_SYMBOL}`
      );
    } catch {
      setFee("Shown in your wallet");
    }
  };

  const send = async () => {
    if (!window.ethereum || !address) return;
    setStep("wallet");
    setSendError(null);
    try {
      const wallet = createWalletClient({ chain: SEND_CHAIN, transport: custom(window.ethereum) });
      const hash = await wallet.sendTransaction({
        account: address as Address,
        chain: SEND_CHAIN,
        to: conversion.revoAddress as Address,
        value: parseEther(amount),
      });
      // Persist the hash before anything else can fail. From here on the transfer
      // is real and must be recorded, never re-sent.
      writeUnrecordedTx(conversion.id, hash);
      setSentHash(hash);
      record.mutate({ id: conversion.id, txid: hash });
    } catch (error) {
      setSendError(classifySendError(error));
      setStep("review");
    }
  };

  // Closing before anything was sent hands the request back to the queue.
  // After a send the lock stays: the row shows Record transaction.
  const close = () => {
    if (busy) return;
    if (!sentHash) {
      trpcClient.ndauConversion.releaseConversionClaim
        .mutate({ id: conversion.id })
        .catch(() => undefined)
        .finally(onChanged);
    }
    openId.current = null;
    onClose();
  };

  const stepIndex = step === "select" ? 0 : step === "review" ? 1 : step === "wallet" ? 2 : 3;
  const recipient = (
    <span className="inline-flex items-center gap-1">
      <span className="text-right">
        {handle && <span className="block font-semibold">{handle}</span>}
        <span className="font-prism-mono text-prism-code-sm font-normal">
          {shortHex(conversion.revoAddress)}
        </span>
      </span>
      <CopyButton value={conversion.revoAddress} label="Copy recipient address" size="inline" />
    </span>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === "select") {
    body = (
      <>
        <ReviewSlab
          rows={[
            { label: "Person", value: handle ?? "Not on Amped.Bio" },
            { label: "ndau amount", value: `${conversion.ndauAmount} ndau` },
            {
              label: "ndau address",
              value: (
                <span className="font-prism-mono text-prism-code-sm">
                  {shortHex(conversion.ndauAddress)}
                </span>
              ),
            },
            { label: "Group", value: NDAU_GROUP_LABELS[conversion.group] || conversion.group },
            { label: "Amount to send", value: `${amount} ${SEND_SYMBOL}` },
            { label: "Recipient", value: recipient },
          ]}
        />
        <section aria-labelledby="process-wallet" className="space-y-3">
          <h3 id="process-wallet" className="text-prism-label font-bold text-prism-ink">
            Wallet
          </h3>
          {!hasWallet ? (
            <Notice variant="warning" title="No wallet found">
              Open this page in a browser with MetaMask to send.
            </Notice>
          ) : !address ? (
            <Button
              variant="secondary"
              onClick={() => void connect()}
              disabled={connecting}
              aria-busy={connecting || undefined}
            >
              {connecting ? <Spinner /> : <Wallet aria-hidden />}
              Connect wallet
            </Button>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-prism-label text-prism-ink">
                <Wallet aria-hidden className="h-5 w-5 text-prism-ink-2" />
                <span className="font-prism-mono text-prism-code-sm">{shortHex(address)}</span>
                <span className="text-prism-ink-2">
                  on {onChain ? SEND_NETWORK : "another network"}
                </span>
              </p>
              {!onChain && (
                <Notice variant="warning" title="Your wallet is on another network.">
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onClick={() => void switchNetwork()}
                    disabled={switching}
                    aria-busy={switching || undefined}
                  >
                    Switch to Libertas Testnet
                  </Button>
                </Notice>
              )}
            </>
          )}
          {walletError && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              {walletError}
            </p>
          )}
        </section>
      </>
    );
    footer = (
      <Button
        size="lg"
        className="w-full"
        disabled={!hasWallet || !address || !onChain}
        onClick={() => void toReview()}
      >
        Review
      </Button>
    );
  } else if (step === "review" || (step === "wallet" && !sentHash)) {
    body = (
      <>
        <ReviewSlab
          rows={[
            { label: "You send", value: `${amount} ${SEND_SYMBOL}` },
            { label: "To", value: recipient },
            { label: "Network", value: SEND_NETWORK },
            {
              label: "From",
              value: (
                <span className="font-prism-mono text-prism-code-sm">
                  {shortHex(address ?? "")}
                </span>
              ),
            },
            { label: "Network fee", value: fee },
            { label: "Conversion", value: `#${conversion.id}, ${conversion.ndauAmount} ndau` },
          ]}
        />
        <Notice variant="warning" title="Testnet only.">
          {TESTNET_NOTICE.replace("Testnet only. ", "")}
        </Notice>
        <Checkbox checked={checked} onCheckedChange={setChecked} required>
          I checked the amount and recipient against the request.{" "}
          <span className="text-prism-ink-2">(Required)</span>
        </Checkbox>
        {sendError && (
          <Notice variant="error" role="alert">
            {sendError}
          </Notice>
        )}
        {step === "wallet" && (
          <p
            role="status"
            className="flex items-center gap-2 text-prism-label font-semibold text-prism-ink"
          >
            <Spinner />
            Confirm in your wallet
          </p>
        )}
      </>
    );
    footer = (
      <>
        <CommitAction
          disabled={!checked || step === "wallet"}
          onClick={() => void send()}
          note={WALLET_NOTE}
        >
          Send {amount} {SEND_SYMBOL}
        </CommitAction>
        {step === "review" && (
          <Button variant="ghost" className="w-full" onClick={() => setStep("select")}>
            Back to the request
          </Button>
        )}
      </>
    );
  } else if (record.isPending || (step === "wallet" && sentHash)) {
    body = (
      <p
        role="status"
        className="flex items-center gap-2 text-prism-label font-semibold text-prism-ink"
      >
        <Spinner />
        Sent. Recording the transaction.
      </p>
    );
    footer = null;
  } else if (recordFailed && sentHash) {
    body = (
      <>
        <Notice variant="warning" title="Sent but not recorded" role="alert">
          Do not send again. Record this transaction to finish.
        </Notice>
        <ReviewSlab
          rows={[
            { label: "Sent", value: `${amount} ${SEND_SYMBOL}` },
            { label: "To", value: recipient },
            { label: "Network", value: SEND_NETWORK },
            {
              label: "Transaction",
              value: (
                <span className="inline-flex items-center gap-1">
                  <span className="font-prism-mono text-prism-code-sm">{shortHex(sentHash)}</span>
                  <CopyButton value={sentHash} label="Copy transaction hash" size="inline" />
                </span>
              ),
            },
          ]}
        />
        <a
          href={explorerTx(sentHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-btn-ghost prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-3 text-prism-label font-semibold"
        >
          View transaction
          <ExternalLink aria-hidden className="h-5 w-5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <p className="text-prism-meta text-prism-ink-2">
          The hash is saved on this device until the server confirms it. Conversion #{conversion.id}{" "}
          stays locked as Processing, so Process never shows again for it.
        </p>
      </>
    );
    footer = (
      <Button
        size="lg"
        className="w-full"
        onClick={() => record.mutate({ id: conversion.id, txid: sentHash })}
        disabled={record.isPending}
      >
        <Check aria-hidden />
        Record transaction
      </Button>
    );
  } else {
    body = (
      <>
        <h3 className="text-prism-panel-title text-prism-ink">Conversion processed</h3>
        <ReviewSlab
          rows={[
            { label: "Sent", value: `${amount} ${SEND_SYMBOL}` },
            { label: "To", value: recipient },
            { label: "Network", value: SEND_NETWORK },
          ]}
        />
        {sentHash && (
          <a
            href={explorerTx(sentHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="prism-btn-ghost prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-3 text-prism-label font-semibold"
          >
            View transaction
            <ExternalLink aria-hidden className="h-5 w-5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </>
    );
    footer = (
      <Button size="lg" className="w-full" onClick={close}>
        Done
      </Button>
    );
  }

  return (
    <SidePanel
      open
      onOpenChange={next => !next && close()}
      eyebrow="Process conversion"
      title={`#${conversion.id}${handle ? ` ${handle}` : ""}`}
      byline={`Requested ${formatDayTime(conversion.createdAt)}`}
      art={
        <span className="flex h-full w-full items-center justify-center text-prism-nav">
          <ArrowLeftRight aria-hidden className="h-[21px] w-[21px]" />
        </span>
      }
      calm={step !== "select"}
      dismissible={!busy}
      footer={footer}
    >
      <StepBar steps={STEPS} current={Math.min(stepIndex, 3)} />
      {body}
    </SidePanel>
  );
}
