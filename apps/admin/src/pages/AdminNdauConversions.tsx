import { FC, Fragment, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, Download, MoreHorizontal, SearchX } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  ChipGroup,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  cn,
  formatHandle,
  trpc,
} from "@repo/ui";
import { NDAU_CONVERSION_CLAIM_TIMEOUT_MS, NDAU_GROUP_LABELS } from "@repo/constants";
import { CopyButton } from "../kit/CopyButton";
import { ConfirmDialog, SearchWell, retryToast } from "../kit/parts";
import { SlabSkeletonRows, rowClass, stickyCell, tdClass, thClass } from "../kit/Slab";
import { WordBadge, type BadgeTone } from "../kit/WordBadge";
import { downloadCsv, formatCount, formatDayTime, shortHex } from "../kit/format";
import { ProcessPanel } from "../components/conversions/ProcessPanel";
import { MarkProcessedDialog } from "../components/conversions/MarkProcessedDialog";
import {
  SEND_SYMBOL,
  clearUnrecordedTx,
  explorerTx,
  readUnrecordedTx,
  type Conversion,
} from "../components/conversions/shared";

// Screen Review 089 I01 to I08, I14, I15. The ndau conversions queue: Status
// chips with counts (Pending by default), a search well, one Export menu, and
// a slab of 8 columns with a 44 disclosure per row for the full values.
// Process opens the value panel (ProcessPanel). The lock before the wallet
// opens and the hash kept until recorded (#232) are unchanged.

type StatusFilter = "pending" | "processing" | "processed" | "failed" | "all";
const COLUMNS = 9;

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "Pending" },
  processing: { tone: "nav", label: "Processing" },
  processed: { tone: "success", label: "Processed" },
  failed: { tone: "danger", label: "Failed" },
};

const CSV_HEADER = [
  "ID",
  "ndau Address",
  "Group",
  "ndau Amount",
  `${SEND_SYMBOL} Amount`,
  `${SEND_SYMBOL} Address`,
  "Amped.Bio User",
  "Amped.Bio Signature",
  "ndau Signature",
  "Status",
  "TXID",
  "Created At",
  "Updated At",
];

function csvRows(list: Conversion[]) {
  return list.map(c => [
    c.id,
    c.ndauAddress,
    c.group,
    c.ndauAmount,
    c.revoAmount,
    c.revoAddress,
    c.user?.handle ?? "",
    c.ampedbioSignature ?? "",
    c.ndauSignature ?? "",
    c.status,
    c.txid ?? "",
    new Date(c.createdAt).toISOString(),
    c.updatedAt ? new Date(c.updatedAt).toISOString() : "",
  ]);
}

const iconButton =
  "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint";

function FullValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid min-h-touch grid-cols-[144px_1fr_auto] items-center gap-3 px-4 py-1">
      <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
      <dd className="min-w-0 break-all font-prism-mono text-prism-code-sm text-prism-ink">
        {value || "None"}
      </dd>
      {value ? (
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} size="inline" />
      ) : (
        <span />
      )}
    </div>
  );
}

export const AdminNdauConversions: FC = () => {
  const conversions = useQuery(trpc.ndauConversion.getAllConversions.queryOptions());
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [processing, setProcessing] = useState<Conversion | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [marking, setMarking] = useState<{ conversion: Conversion; prefill?: string } | null>(null);
  const [releasing, setReleasing] = useState<Conversion | null>(null);
  const [discarding, setDiscarding] = useState<Conversion | null>(null);
  // Bumped when a stored hash changes, so rows re-read localStorage
  const [, setStoredVersion] = useState(0);

  const refetch = () => {
    setStoredVersion(v => v + 1);
    void conversions.refetch();
  };

  const claim = useMutation({
    mutationFn: trpc.ndauConversion.claimConversionForProcessing.mutationOptions().mutationFn,
  });
  const release = useMutation({
    mutationFn: trpc.ndauConversion.releaseConversionClaim.mutationOptions().mutationFn,
    onSettled: refetch,
  });
  // Records a hash this browser already holds (row Record transaction)
  const record = useMutation({
    mutationFn: trpc.ndauConversion.confirmConversionTxid.mutationOptions().mutationFn,
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    onSuccess: (_data, variables) => {
      clearUnrecordedTx(variables.id);
      toast.success(`Conversion #${variables.id} recorded`);
      refetch();
    },
    onError: (_error, variables) => {
      retryToast(`Conversion #${variables.id} is still not recorded. Do not send again.`, () =>
        record.mutate(variables)
      );
      refetch();
    },
  });

  const all = useMemo(() => conversions.data ?? [], [conversions.data]);
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      all: all.length,
    };
    for (const c of all) {
      if (c.status in result) result[c.status as StatusFilter] += 1;
    }
    return result;
  }, [all]);

  const view = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (!term) return true;
      return [
        c.ndauAddress,
        c.revoAddress,
        c.user?.handle,
        `@${c.user?.handle ?? ""}`,
        String(c.id),
      ].some(value => value?.toLowerCase().includes(term));
    });
  }, [all, status, search]);

  const startProcess = async (conversion: Conversion) => {
    // A transfer this browser already sent must be recorded, never sent again,
    // even if the request was released back to pending meanwhile (#232).
    const stored = readUnrecordedTx(conversion.id);
    if (stored) {
      toast.error("A transfer was already sent for this request. Recording it instead.");
      record.mutate({ id: conversion.id, txid: stored });
      return;
    }
    // Lock the request on the server before any wallet opens. Only one admin wins.
    setClaimingId(conversion.id);
    try {
      await claim.mutateAsync({ id: conversion.id });
      setProcessing(conversion);
    } catch {
      toast.error(`Conversion #${conversion.id} is already being processed.`);
    } finally {
      setClaimingId(null);
      refetch();
    }
  };

  const exportCsv = (list: Conversion[], scope: string) => {
    if (list.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`ndau-conversions-${scope}-${today}.csv`, CSV_HEADER, csvRows(list));
  };

  const statusOptions = (
    ["pending", "processing", "processed", "failed", "all"] as StatusFilter[]
  ).map(value => ({
    value,
    label: (
      <>
        {value === "all" ? "All" : STATUS[value].label}
        <span className="tabular-nums">{formatCount(counts[value])}</span>
      </>
    ),
  }));

  return (
    <div className="space-y-[13px] font-prism">
      <ChipGroup label="Status" options={statusOptions} value={status} onChange={setStatus} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <SearchWell
          label="Search conversions"
          placeholder="ndau address, recipient or @handle"
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" disabled={all.length === 0}>
              <Download aria-hidden />
              Export
              <ChevronDown aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem disabled={view.length === 0} onSelect={() => exportCsv(view, status)}>
              This view
            </MenuItem>
            <MenuItem onSelect={() => exportCsv(all, "all")}>All</MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {conversions.isError ? (
        <ErrorCard
          title="Conversions did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void conversions.refetch()}
        />
      ) : (
        <div className="prism-slab overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="ndau conversions" className="w-full min-w-[1100px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={`${thClass} ${stickyCell}`}>
                    Request
                  </th>
                  <th scope="col" className={thClass}>
                    Person
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    ndau
                  </th>
                  <th scope="col" className={thClass}>
                    Group
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Send, <span className="normal-case">{SEND_SYMBOL}</span>
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={thClass}>
                    Tx
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Action
                  </th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              {conversions.isPending ? (
                <SlabSkeletonRows columns={COLUMNS} />
              ) : view.length === 0 ? (
                <tbody>
                  <tr className="border-t border-prism-line">
                    <td colSpan={COLUMNS}>
                      {search.trim() ? (
                        <EmptyState
                          icon={SearchX}
                          title={`No conversions match ${search.trim()}`}
                          action={
                            <Button variant="ghost" onClick={() => setSearch("")}>
                              Clear search
                            </Button>
                          }
                        />
                      ) : status === "pending" ? (
                        <EmptyState
                          icon={ArrowLeftRight}
                          title="No pending conversions"
                          description="New requests appear here."
                          action={
                            <Button variant="ghost" onClick={() => setStatus("all")}>
                              Show all
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState icon={ArrowLeftRight} title="No conversions here" />
                      )}
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {view.map(c => {
                    const stored = readUnrecordedTx(c.id);
                    const badge = STATUS[c.status] ?? { tone: "ink" as BadgeTone, label: c.status };
                    const lockedNoTx = c.status === "processing" && !c.txid;
                    const isOpen = expanded === c.id;
                    const handle = c.user?.handle;
                    let action: React.ReactNode = null;
                    if (stored && (c.status === "pending" || lockedNoTx)) {
                      // This browser already sent a transfer for the request. Record it;
                      // never send again.
                      action = (
                        <Button
                          variant="secondary"
                          onClick={() => record.mutate({ id: c.id, txid: stored })}
                          disabled={record.isPending}
                          title={stored}
                        >
                          Record transaction
                        </Button>
                      );
                    } else if (c.status === "pending") {
                      action = (
                        <Button
                          variant="secondary"
                          onClick={() => void startProcess(c)}
                          disabled={claimingId !== null}
                          aria-busy={claimingId === c.id || undefined}
                        >
                          Process
                        </Button>
                      );
                    } else if (processing?.id === c.id) {
                      action = (
                        <span className="text-prism-meta text-prism-ink-2">Open in panel</span>
                      );
                    }
                    const canMark = c.status === "pending" || c.status === "processing";
                    return (
                      <Fragment key={c.id}>
                        <tr className={cn(rowClass, isOpen && "bg-white/40")}>
                          <td className={`${tdClass} ${stickyCell}`}>
                            <p className="text-prism-label font-semibold tabular-nums text-prism-ink">
                              #{c.id}
                            </p>
                            <p className="whitespace-nowrap text-prism-meta tabular-nums text-prism-ink-2">
                              {formatDayTime(c.createdAt)}
                            </p>
                          </td>
                          <td className={tdClass}>
                            {handle ? (
                              <a
                                href={`${import.meta.env.VITE_LANDINGPAGE_URL}/${formatHandle(handle)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="prism-focus rounded-prism-8 text-prism-label text-prism-ink hover:underline"
                              >
                                {formatHandle(handle)}
                                <span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            ) : (
                              <span className="text-prism-meta text-prism-ink-2">
                                Not on Amped.Bio
                              </span>
                            )}
                          </td>
                          <td className={`${tdClass} text-right`}>
                            <p className="whitespace-nowrap text-prism-label tabular-nums text-prism-ink">
                              {c.ndauAmount}
                            </p>
                            <p className="font-prism-mono text-prism-code-sm text-prism-ink-2">
                              {shortHex(c.ndauAddress)}
                            </p>
                          </td>
                          <td className={`${tdClass} text-prism-meta text-prism-ink`}>
                            {NDAU_GROUP_LABELS[c.group] || c.group}
                          </td>
                          <td className={`${tdClass} text-right`}>
                            <p className="whitespace-nowrap text-prism-label font-semibold tabular-nums text-prism-ink">
                              {c.revoAmount} {SEND_SYMBOL}
                            </p>
                            <p className="whitespace-nowrap text-prism-meta text-prism-ink-2">
                              to{" "}
                              <span className="font-prism-mono text-prism-code-sm">
                                {shortHex(c.revoAddress)}
                              </span>
                            </p>
                          </td>
                          <td className={tdClass}>
                            <WordBadge tone={badge.tone}>{badge.label}</WordBadge>
                            {lockedNoTx && (
                              <p className="mt-1 whitespace-nowrap text-prism-meta text-prism-ink-2">
                                by{" "}
                                {c.claimedByCurrentUser ? "you" : (c.claimedBy ?? "another admin")}
                              </p>
                            )}
                          </td>
                          <td className={tdClass}>
                            {c.txid || stored ? (
                              <a
                                href={explorerTx((c.txid || stored)!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="prism-focus whitespace-nowrap rounded-prism-8 font-prism-mono text-prism-code-sm text-prism-nav hover:underline"
                              >
                                {shortHex((c.txid || stored)!)}
                                <span className="sr-only">
                                  {" "}
                                  (opens the transaction in a new tab)
                                </span>
                              </a>
                            ) : (
                              <span className="text-prism-meta text-prism-ink-2">None</span>
                            )}
                          </td>
                          <td className={`${tdClass} whitespace-nowrap text-right`}>
                            <span className="inline-flex items-center gap-1">
                              {action}
                              {(canMark || stored) && (
                                <Menu>
                                  <MenuTrigger
                                    aria-label={`More actions for conversion ${c.id}`}
                                    className={iconButton}
                                  >
                                    <MoreHorizontal aria-hidden className="h-5 w-5" />
                                  </MenuTrigger>
                                  <MenuContent align="end">
                                    {canMark && (
                                      <MenuItem
                                        onSelect={() =>
                                          setMarking({
                                            conversion: c,
                                            prefill: stored ?? c.txid ?? undefined,
                                          })
                                        }
                                      >
                                        Mark as processed
                                      </MenuItem>
                                    )}
                                    {lockedNoTx && (
                                      <MenuItem
                                        disabled={!c.canRelease || release.isPending}
                                        onSelect={() => setReleasing(c)}
                                      >
                                        {c.canRelease
                                          ? "Release to Pending"
                                          : `Release after ${NDAU_CONVERSION_CLAIM_TIMEOUT_MS / 60000} minutes`}
                                      </MenuItem>
                                    )}
                                    {stored && (
                                      <>
                                        <MenuSeparator />
                                        <MenuItem destructive onSelect={() => setDiscarding(c)}>
                                          Discard stored hash
                                        </MenuItem>
                                      </>
                                    )}
                                  </MenuContent>
                                </Menu>
                              )}
                            </span>
                          </td>
                          <td className={tdClass}>
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={`conversion-${c.id}-details`}
                              aria-label={`Details for conversion ${c.id}`}
                              onClick={() => setExpanded(isOpen ? null : c.id)}
                              className={iconButton}
                            >
                              <ChevronDown
                                aria-hidden
                                className={cn(
                                  "h-5 w-5 transition-transform duration-prism-hover",
                                  isOpen && "rotate-180"
                                )}
                              />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr
                            id={`conversion-${c.id}-details`}
                            className="border-t border-prism-line"
                          >
                            <td colSpan={COLUMNS} className="p-3">
                              <dl className="prism-slab divide-y divide-prism-line">
                                <FullValue label="ndau address" value={c.ndauAddress} />
                                <FullValue label="Recipient" value={c.revoAddress} />
                                <FullValue
                                  label="Amped.Bio signature"
                                  value={c.ampedbioSignature}
                                />
                                <FullValue label="ndau signature" value={c.ndauSignature} />
                                {(c.txid || stored) && (
                                  <FullValue label="Transaction" value={c.txid || stored} />
                                )}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      <ProcessPanel
        conversion={processing}
        onClose={() => setProcessing(null)}
        onChanged={refetch}
      />
      <MarkProcessedDialog
        conversion={marking?.conversion ?? null}
        prefill={marking?.prefill}
        onClose={() => setMarking(null)}
        onDone={refetch}
      />
      <ConfirmDialog
        open={!!releasing}
        onOpenChange={open => !open && setReleasing(null)}
        title={`Release #${releasing?.id ?? ""} to Pending?`}
        body="Only release when no transfer was sent. Check the conversion wallet on the explorer first. If a transfer was sent, use Mark as processed with its hash."
        confirmLabel="Release to Pending"
        busy={release.isPending}
        onConfirm={() =>
          releasing &&
          release.mutate(
            { id: releasing.id },
            {
              onSuccess: () => {
                setReleasing(null);
                toast.success(`Conversion #${releasing.id} is pending again`);
              },
              onError: () => {
                setReleasing(null);
                toast.error(`Conversion #${releasing.id} was not released`);
              },
            }
          )
        }
      />
      <ConfirmDialog
        open={!!discarding}
        onOpenChange={open => !open && setDiscarding(null)}
        title="Discard the stored hash?"
        body="Only discard it when the server rejected it and the explorer shows it does not pay this request. Otherwise record it or use Mark as processed."
        confirmLabel="Discard hash"
        destructive
        onConfirm={() => {
          if (!discarding) return;
          clearUnrecordedTx(discarding.id);
          setDiscarding(null);
          refetch();
          toast.success("Stored hash discarded");
        }}
      />
    </div>
  );
};
