import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { encodeFunctionData, type PublicClient } from "viem";
import { CheckCircle2, RefreshCw, Upload } from "lucide-react";
import { Button, CommitAction, ErrorCard, Notice, SidePanel, StepBar } from "@repo/ui";
import { formatRnsName, RESOLVER_ABI, rnsNode } from "@repo/web3";
import { useSignedUpload } from "@/hooks/rns/useSignedUpload";
import { useFeeEstimate, useTrackedWrite } from "@/hooks/rns/useRegistration";
import { ComplianceCard } from "../../../explore/pool-panel/sections";
import { formatRnsAmount } from "../format";
import { NameTile, RnsName } from "../shared";
import { ChainStatus, Row, TxLink } from "../flowParts";
import { useNameFlowGate } from "./NameFlowGate";
import { RNS_RECORD_KEYS, type RnsNameState } from "./useRnsName";
import type { PendingBanner, PublishRow } from "./usePublishDiff";

const STEPS = ["Profile", "Review", "Confirm in wallet"];

function Thumb({ src, label }: { src: string; label: string }) {
  return src ? (
    <img src={src} alt={label} className="h-[34px] w-[34px] rounded-prism-8 object-cover" />
  ) : (
    <span className="text-prism-meta text-prism-ink-2">None</span>
  );
}

/** One review row per changed record: old to new, thumbnails for images (111 I08). */
function ChangeRow({ row }: { row: PublishRow }) {
  return (
    <div className="space-y-1 px-4 py-3">
      <dt className="text-prism-label font-semibold text-prism-ink">{row.label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 text-prism-meta text-prism-ink-2">
        {row.image ? (
          <>
            <Thumb src={row.from} label={`${row.label}, now`} />
            <span aria-hidden>→</span>
            <span className="sr-only">changes to</span>
            <Thumb src={row.to} label={`${row.label}, after publish`} />
          </>
        ) : (
          <>
            <span className="min-w-0 break-words">{row.from || "None"}</span>
            <span aria-hidden>→</span>
            <span className="sr-only">changes to</span>
            <span className="min-w-0 break-words font-semibold text-prism-ink">
              {row.to || "None"}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * Screen Review 111 I08 to I15: Publish changes in the value panel. The
 * Amped.Bio profile is written to the RNS name's text records in one
 * transaction (setText, or multicallWithNodeCheck for several), only by the
 * owner's wallet, after the fee and the compliance card.
 */
export function PublishFlow({
  name,
  chainId,
  rows,
  banner,
  onClose,
  onPublished,
}: {
  name: RnsNameState;
  chainId: number;
  rows: PublishRow[];
  banner: PendingBanner | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const fullName = formatRnsName(name.label, chainId);
  const { address, chain } = useAccount();
  const explorer = chain?.blockExplorers?.default?.url;
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const balance = useBalance({ address, chainId, query: { enabled: !!address } });
  const gate = useNameFlowGate(name, chainId, { ownerOnly: true, verb: "publish to" });
  const tracked = useTrackedWrite();
  const { uploadAll } = useSignedUpload();
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [doneRows, setDoneRows] = useState<PublishRow[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const node = rnsNode(name.label, chainId);
  const resolver = name.resolver;

  const buildRequest = (values: Record<string, string>) => {
    if (!resolver || rows.length === 0) return null;
    const entries = rows.map(row => [RNS_RECORD_KEYS[row.key], values[row.key] ?? row.to]);
    if (entries.length === 1) {
      return {
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: "setText" as const,
        args: [node, entries[0][0], entries[0][1]] as const,
      };
    }
    const calldata = entries.map(([key, value]) =>
      encodeFunctionData({ abi: RESOLVER_ABI, functionName: "setText", args: [node, key, value] })
    );
    return {
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: "multicallWithNodeCheck" as const,
      args: [node, calldata] as const,
    };
  };

  const fee = useFeeEstimate(
    ["publish", name.label, address, rows.map(row => `${row.key}:${row.to}`).join("|")],
    !gate && !!address && rows.length > 0,
    (client: PublicClient) =>
      client.estimateContractGas({
        ...(buildRequest({}) as NonNullable<ReturnType<typeof buildRequest>>),
        account: address!,
      } as Parameters<PublicClient["estimateContractGas"]>[0])
  );

  const publish = async () => {
    setUploadFailed(false);
    const values: Record<string, string> = {};
    // A new banner file uploads first (the RNS backend asks for a signature)
    if (banner?.file) {
      setUploading(true);
      try {
        const urls = await uploadAll(name.label, { banner: banner.file });
        if (!urls.banner) throw new Error("No banner URL");
        values.banner = urls.banner;
      } catch {
        setUploadFailed(true);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    const request = buildRequest(values);
    if (!request) return;
    const ok = await tracked.run(request as unknown as Parameters<typeof tracked.run>[0], 0n);
    if (ok) {
      setDoneRows(rows);
      onPublished();
    }
  };

  useEffect(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [doneRows]);

  const phase = tracked.state.phase;
  const signing = phase === "signing" || uploading;
  const busy = signing || phase === "chain";
  const feeWei = fee.data;
  const balanceWei = balance.data?.value;
  const amount = (wei: bigint) => `${formatRnsAmount(wei)} ${symbol}`;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (doneRows) {
    body = (
      <dl className="prism-slab divide-y divide-prism-line">
        <div className="flex min-h-commit items-center gap-2 px-4">
          <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
          <p className="text-prism-panel-title text-prism-success">
            <span className="break-all">{fullName}</span> is up to date
          </p>
        </div>
        <Row label="Published">
          {doneRows.length} {doneRows.length === 1 ? "change" : "changes"}
        </Row>
        <Row label="Paid">
          {tracked.state.paidWei !== undefined ? amount(tracked.state.paidWei) : "Not available"}
        </Row>
        <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-1">
          <dt className="text-prism-label text-prism-ink-2">Transaction</dt>
          <dd>
            <TxLink explorer={explorer} hash={tracked.state.hash} />
          </dd>
        </div>
      </dl>
    );
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={onClose}>
        Done
      </Button>
    );
  } else if (gate) {
    body = gate.body;
    footer = gate.footer;
  } else {
    body = (
      <>
        <dl className="prism-slab divide-y divide-prism-line">
          {rows.map(row => (
            <ChangeRow key={row.key} row={row} />
          ))}
          {fee.isError ? (
            <div className="flex min-h-touch items-center justify-between gap-3 px-4 py-1">
              <dt className="text-prism-label text-prism-ink-2">Network fee: not available</dt>
              <dd>
                <Button type="button" variant="secondary" onClick={() => void fee.refetch()}>
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
          <Row label="Balance after">
            {feeWei !== undefined && balanceWei !== undefined
              ? amount(balanceWei - feeWei)
              : "Loading"}
          </Row>
        </dl>
        <ComplianceCard />
        {phase === "declined" && (
          <Notice variant="info" role="status">
            You cancelled in your wallet. Nothing changed.
          </Notice>
        )}
        {uploadFailed && (
          <ErrorCard
            title="Publish did not complete"
            cause="The new banner did not upload. Nothing changed on your RNS name."
            onRetry={() => void publish()}
            retryLabel="Retry"
            className="!rounded-prism-21"
          />
        )}
        {phase === "failed" && (
          <div className="space-y-2">
            <ErrorCard
              title="Publish did not complete"
              cause="The transaction failed. Your RNS name did not change. The network fee may still be charged."
              onRetry={() => {
                tracked.reset();
                void publish();
              }}
              retryLabel="Retry"
              className="!rounded-prism-21"
            />
            <TxLink explorer={explorer} hash={tracked.state.hash} />
          </div>
        )}
        <ChainStatus tx={tracked.state} explorer={explorer} what="Publishing on chain" />
      </>
    );
    footer = (
      <>
        <CommitAction
          disabled={busy || feeWei === undefined || rows.length === 0}
          onClick={() => void publish()}
        >
          {signing ? (
            "Confirm in your wallet"
          ) : (
            <>
              <Upload aria-hidden />
              Publish to <span className="truncate">{fullName}</span>
            </>
          )}
        </CommitAction>
        {!busy && (
          <div className="flex justify-center">
            <Button type="button" variant="ghost" onClick={onClose}>
              Back
            </Button>
          </div>
        )}
      </>
    );
  }

  const current = doneRows ? 3 : busy ? 2 : 1;
  const count = (doneRows ?? rows).length;
  return (
    <SidePanel
      open
      onOpenChange={next => {
        if (!next) onClose();
      }}
      eyebrow="Publish changes"
      title={<RnsName label={name.label} chainId={chainId} />}
      byline={`${count} ${count === 1 ? "change" : "changes"} from your Amped.Bio profile`}
      art={<NameTile src={name.records.avatar} size={55} />}
      calm
      dismissible={!signing}
      footer={footer}
    >
      <h3 ref={headingRef} tabIndex={-1} className="sr-only">
        {doneRows ? `${fullName} is up to date` : `Step ${Math.min(current, 2) + 1} of 3`}
      </h3>
      <StepBar steps={STEPS} current={current} />
      {body}
    </SidePanel>
  );
}
