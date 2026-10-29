import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorCard, Notice, Skeleton, Button, trpc } from "@repo/ui";
import { PAYMENT_GROUP_LABELS, PAYMENT_GROUP_ORDER } from "@repo/constants";
import { SlabTable, rowClass, stickyCell, tdClass, thClass } from "../../kit/Slab";
import { WordBadge } from "../../kit/WordBadge";
import { formatDay } from "../../kit/format";
import { DraftSheet, ReviewSheet } from "./ChangeSheet";
import {
  PaymentsNav,
  WhereBadge,
  who,
  type PaymentChange,
  type PaymentSettingRow,
  type PaymentsViewer,
} from "./shared";

// Board a2, Payments Settings (spec 3.3, 3.4, 3.8). Every AmpedPay value grouped as on
// the board: current value, allowed range, where it lives, last change. Server values
// open the change sheet; on chain values change through the Safe (PAY-A2); fixed values
// never change. Items changed outside Amped.Bio are listed with where they change.

function lastChangeText(row: PaymentSettingRow): string {
  if (row.lastChange) {
    return `${formatDay(row.lastChange.appliedAt)}, ${who(row.lastChange.approvedBy ?? row.lastChange.draftedBy, row.lastChange.approvedById ?? row.lastChange.draftedById)}`;
  }
  if (row.target === "server") return row.value === null ? "From env" : "At launch";
  return "At deploy";
}

function ActionCell({
  row,
  viewer,
  onChange,
  onReview,
}: {
  row: PaymentSettingRow;
  viewer: PaymentsViewer | undefined;
  onChange: (row: PaymentSettingRow) => void;
  onReview: (change: PaymentChange) => void;
}) {
  if (row.waiting) {
    const mine = viewer?.userId === row.waiting.draftedById;
    if (!viewer?.canChange || row.waiting.status !== "draft") {
      return (
        <WordBadge tone={row.waiting.scheduled ? "nav" : "warning"}>
          {row.waiting.scheduled
            ? `Applies ${formatDay(row.waiting.effectiveAt)}`
            : `Waiting: ${row.waiting.newText}`}
        </WordBadge>
      );
    }
    return (
      <Button variant={mine ? "secondary" : "default"} onClick={() => onReview(row.waiting!)}>
        {mine ? "Your draft" : "Review draft"}
      </Button>
    );
  }
  if (row.target !== "server") {
    return (
      <span className="text-prism-meta text-prism-ink-2">
        {row.target === "fixed" ? "Cannot change" : "Through the Safe"}
      </span>
    );
  }
  if (!viewer?.canChange) return null;
  return (
    <Button
      variant="secondary"
      aria-label={`Change ${row.label}`}
      onClick={() => onChange(row)}
      disabled={!viewer.twoFactorOn}
    >
      Change
    </Button>
  );
}

function GroupTable({
  title,
  rows,
  viewer,
  onChange,
  onReview,
}: {
  title: string;
  rows: PaymentSettingRow[];
  viewer: PaymentsViewer | undefined;
  onChange: (row: PaymentSettingRow) => void;
  onReview: (change: PaymentChange) => void;
}) {
  const id = `payments-group-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-prism-panel-title text-prism-ink">
        {title}
      </h2>
      <SlabTable label={title}>
        <thead>
          <tr>
            <th scope="col" className={`${thClass} ${stickyCell}`}>
              Setting
            </th>
            <th scope="col" className={thClass}>
              Current
            </th>
            <th scope="col" className={thClass}>
              Allowed
            </th>
            <th scope="col" className={thClass}>
              Where
            </th>
            <th scope="col" className={thClass}>
              Last change
            </th>
            <th scope="col" aria-label="Action" className={thClass} />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className={rowClass}>
              <th scope="row" className={`${tdClass} ${stickyCell} py-2 text-left font-normal`}>
                <span className="block text-prism-label font-semibold text-prism-ink">
                  {row.label}
                </span>
                {row.hint && (
                  <span className="block text-prism-meta text-prism-ink-2">{row.hint}</span>
                )}
              </th>
              <td
                className={`${tdClass} whitespace-nowrap text-prism-label font-semibold tabular-nums text-prism-ink`}
              >
                {row.kind === "address" && row.value ? (
                  <span className="font-mono text-prism-meta">{row.value}</span>
                ) : row.kind === "address" ? (
                  <span className="font-normal text-prism-ink-2">Read with the Safe flow</span>
                ) : (
                  row.valueText
                )}
              </td>
              <td className={`${tdClass} text-prism-label text-prism-ink-2`}>{row.allowed}</td>
              <td className={tdClass}>
                <WhereBadge target={row.target} />
              </td>
              <td className={`${tdClass} whitespace-nowrap text-prism-meta text-prism-ink-2`}>
                {lastChangeText(row)}
              </td>
              <td className={`${tdClass} py-2 text-right`}>
                <ActionCell row={row} viewer={viewer} onChange={onChange} onReview={onReview} />
              </td>
            </tr>
          ))}
        </tbody>
      </SlabTable>
    </section>
  );
}

const OUTSIDE = [
  { item: "Safe owners and signatures needed", where: "Safe app" },
  {
    item: "Coinbase account policies (relayer, split signer, pauser, Safe proposer)",
    where: "Coinbase Developer Platform, runbook docs/ops/cdp-policy.md",
  },
  { item: "Contract upgrades", where: "Safe, after the audit" },
  { item: "API keys, secrets and RPC URLs", where: "Server secret store. Never shown here." },
];

export function PaymentsSettings() {
  const viewer = useQuery(trpc.admin.payments.viewer.queryOptions());
  const settings = useQuery(trpc.admin.payments.settings.queryOptions());
  const [editing, setEditing] = useState<PaymentSettingRow | null>(null);
  const [review, setReview] = useState<PaymentChange | null>(null);

  if (settings.isPending) {
    return (
      <div aria-busy className="space-y-[13px] font-prism">
        <Skeleton delayMs={400} className="h-[55px] w-full !rounded-prism-21" />
        <Skeleton delayMs={400} className="h-[300px] w-full !rounded-prism-21" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <ErrorCard
        title="Payment settings did not load"
        cause="Try again in a moment."
        retryLabel="Retry"
        onRetry={() => void settings.refetch()}
      />
    );
  }

  const items = settings.data.items.filter(item => !item.hidden);

  return (
    <div className="space-y-[21px] font-prism">
      <PaymentsNav />
      <p className="max-w-[72ch] text-prism-body text-prism-ink-2">
        Every value AmpedPay uses. Server values apply when a second payments admin approves. On
        chain values change through the Safe. A change applies to new quotes only.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-prism-meta text-prism-ink-2">
        <span className="flex items-center gap-2">
          <WhereBadge target="server" /> Saved by Amped.Bio
        </span>
        <span className="flex items-center gap-2">
          <WhereBadge target="contract" /> Stored in the AmpedPay contract
        </span>
        <span className="flex items-center gap-2">
          <WhereBadge target="fixed" /> Set in the audited contract, cannot change
        </span>
      </div>
      {settings.data.contractSource === "deploy" && (
        <Notice variant="info" title="On chain values show the deploy defaults.">
          <p>They are read from Base once the contract is deployed and the Safe flow ships.</p>
        </Notice>
      )}
      {viewer.data && !viewer.data.canChange && (
        <Notice variant="info" title="You can view payment settings.">
          <p>Changes need the payments admin role.</p>
        </Notice>
      )}
      {PAYMENT_GROUP_ORDER.map(group => {
        const rows = items.filter(item => item.group === group);
        if (rows.length === 0) return null;
        return (
          <GroupTable
            key={group}
            title={PAYMENT_GROUP_LABELS[group]}
            rows={rows}
            viewer={viewer.data}
            onChange={setEditing}
            onReview={setReview}
          />
        );
      })}
      <section aria-labelledby="payments-outside-title" className="space-y-3">
        <h2 id="payments-outside-title" className="text-prism-panel-title text-prism-ink">
          Changed outside Amped.Bio
        </h2>
        <Notice variant="warning" title="These are shown here and changed where they live.">
          <p>The portal never holds a Safe owner key or a Coinbase secret.</p>
        </Notice>
        <SlabTable label="Changed outside Amped.Bio">
          <thead>
            <tr>
              <th scope="col" className={thClass}>
                Item
              </th>
              <th scope="col" className={thClass}>
                Where it changes
              </th>
            </tr>
          </thead>
          <tbody>
            {OUTSIDE.map(row => (
              <tr key={row.item} className={rowClass}>
                <td className={`${tdClass} py-2 text-prism-label font-semibold text-prism-ink`}>
                  {row.item}
                </td>
                <td className={`${tdClass} py-2 text-prism-label text-prism-ink-2`}>{row.where}</td>
              </tr>
            ))}
          </tbody>
        </SlabTable>
      </section>
      <DraftSheet
        row={editing}
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
      />
      <ReviewSheet
        change={review}
        viewer={viewer.data}
        open={review !== null}
        onOpenChange={open => !open && setReview(null)}
      />
    </div>
  );
}
