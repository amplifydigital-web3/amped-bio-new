import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { AMPEDPAY_CONTRACT, MERCHANT_ROLES, type MerchantRole } from "@repo/constants";
import { Button, ErrorCard, Input, trpc, type RouterOutputs } from "@repo/ui";
import { Eyebrow } from "../kit/parts";
import {
  SlabMessageRow,
  SlabSkeletonRows,
  SlabTable,
  rowClass,
  tdClass,
  thClass,
} from "../kit/Slab";
import { WordBadge, type BadgeTone } from "../kit/WordBadge";

// Admin, Money, Merchants (Build Board #66, AB-1, board a1; docs/features/authbase-storefront.md
// 3.2 and 3.8). Business sellers on AmpedPay. One payments admin creates a merchant, adds its
// members and records the business check. Turning it on or off and its fee need a second
// payments admin (M1, M3). Every write asks for a fresh two factor code.

type MerchantRow = RouterOutputs["admin"]["merchants"]["list"][number];
type MerchantDetail = RouterOutputs["admin"]["merchants"]["get"];

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  active: { label: "Taking payments", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
};

function StatusWord({ status }: { status: string }) {
  const entry = STATUS[status] ?? STATUS.pending!;
  return <WordBadge tone={entry.tone}>{entry.label}</WordBadge>;
}

function percent(bps: number | string) {
  return `${Number(bps) / 100}%`;
}

function short(address: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "None";
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-prism-label font-semibold text-prism-ink">
      Two factor code
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-touch max-w-[160px]"
      />
    </label>
  );
}

export function AdminMerchants() {
  const queryClient = useQueryClient();
  const list = useQuery(trpc.admin.merchants.list.queryOptions());
  const viewer = useQuery(trpc.admin.payments.viewer.queryOptions());
  const [selected, setSelected] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.merchants.pathKey() });
  const failed = (error: { message: string }) => toast.error(error.message);

  const create = useMutation({
    ...trpc.admin.merchants.create.mutationOptions(),
    onSuccess: result => {
      toast.success("Merchant added. It is pending until a second admin turns it on.");
      setSlug("");
      setName("");
      setCode("");
      setSelected(result?.id ?? null);
      void refresh();
    },
    onError: failed,
  });

  const canChange = viewer.data?.canChange ?? false;

  return (
    <div className="space-y-[21px] font-prism">
      <p className="max-w-[72ch] text-prism-body text-prism-ink-2">
        Businesses that sell on Amped.Bio through AmpedPay. A merchant takes payments only after the
        business check is on file and a second payments admin turns it on.
      </p>

      {list.isError ? (
        <ErrorCard title="Merchants did not load" onRetry={() => void list.refetch()} />
      ) : (
        <SlabTable label="Merchants">
          <thead>
            <tr>
              <th className={thClass}>Merchant</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Fee</th>
              <th className={thClass}>Payout wallet</th>
              <th className={thClass}>Business check</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <SlabSkeletonRows columns={5} rows={3} />
            ) : (list.data ?? []).length === 0 ? (
              <SlabMessageRow columns={5}>No merchants yet.</SlabMessageRow>
            ) : (
              (list.data ?? []).map((m: MerchantRow) => (
                <tr key={m.id} className={rowClass} aria-selected={selected === m.id || undefined}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      className="prism-focus inline-flex min-h-touch items-center font-semibold text-prism-nav"
                      onClick={() => setSelected(m.id)}
                    >
                      {m.name}
                    </button>
                  </td>
                  <td className={tdClass}>
                    <StatusWord status={m.status} />
                  </td>
                  <td className={tdClass}>{percent(m.feeBps)}</td>
                  <td className={`${tdClass} font-mono text-prism-label`}>
                    {short(m.payoutWallet)}
                  </td>
                  <td className={tdClass}>
                    <WordBadge tone={m.businessCheckComplete ? "success" : "warning"}>
                      {m.businessCheckComplete ? "On file" : "To do"}
                    </WordBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </SlabTable>
      )}

      {canChange && (
        <section className="prism-slab space-y-3 p-[21px]" aria-labelledby="add-merchant">
          <h2 id="add-merchant" className="text-prism-title font-bold text-prism-ink">
            Add a merchant
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Business name
              <Input value={name} onChange={e => setName(e.target.value)} className="h-touch" />
            </label>
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Slug
              <Input value={slug} onChange={e => setSlug(e.target.value)} className="h-touch" />
            </label>
            <CodeField value={code} onChange={setCode} />
            <Button
              onClick={() => create.mutate({ slug, name, code })}
              disabled={create.isPending || !slug || !name || code.length !== 6}
            >
              Add merchant
            </Button>
          </div>
        </section>
      )}

      {selected && <MerchantPanel id={selected} canChange={canChange} onChanged={refresh} />}
    </div>
  );
}

function MerchantPanel({
  id,
  canChange,
  onChanged,
}: {
  id: string;
  canChange: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const detail = useQuery(trpc.admin.merchants.get.queryOptions({ id }));
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [fee, setFee] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState<MerchantRole>("owner");
  const [check, setCheck] = useState({
    registration: false,
    beneficialOwners: false,
    sanctionsScreen: false,
  });

  const done = (message: string) => {
    toast.success(message);
    setCode("");
    void onChanged();
  };
  const failed = (error: { message: string }) => toast.error(error.message);

  const draft = useMutation({
    ...trpc.admin.merchants.draft.mutationOptions(),
    onSuccess: () => done("Sent for approval. A different payments admin approves it."),
    onError: failed,
  });
  const approve = useMutation({
    ...trpc.admin.merchants.approve.mutationOptions(),
    onSuccess: () => done("Approved and applied."),
    onError: failed,
  });
  const reject = useMutation({
    ...trpc.admin.merchants.reject.mutationOptions(),
    onSuccess: () => done("Change rejected."),
    onError: failed,
  });
  const record = useMutation({
    ...trpc.admin.merchants.recordBusinessCheck.mutationOptions(),
    onSuccess: () => done("Business check saved."),
    onError: failed,
  });
  const member = useMutation({
    ...trpc.admin.merchants.setMember.mutationOptions(),
    onSuccess: () => done("Member saved."),
    onError: failed,
  });

  if (detail.isError)
    return <ErrorCard title="This merchant did not load" onRetry={() => void detail.refetch()} />;
  const m: MerchantDetail | undefined = detail.data;
  if (!m) return null;
  const waiting = m.changes.filter(c => c.status === "draft");
  const ready = code.length === 6;

  return (
    <section className="space-y-[21px]" aria-labelledby="merchant-name">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="merchant-name" className="text-prism-title font-bold text-prism-ink">
          {m.name}
        </h2>
        <StatusWord status={m.status} />
      </div>

      <dl className="prism-slab grid gap-2 p-[21px] sm:grid-cols-2">
        <div>
          <dt className="text-prism-label text-prism-ink-2">Fee on sales</dt>
          <dd className="font-semibold">{percent(m.feeBps)}</dd>
        </div>
        <div>
          <dt className="text-prism-label text-prism-ink-2">Payout wallet</dt>
          <dd className="break-all font-mono text-prism-label">
            {m.payoutWallets.find(w => w.status === "effective")?.address ?? "None yet"}
          </dd>
        </div>
      </dl>

      {canChange && <CodeField value={code} onChange={setCode} />}

      {waiting.length > 0 && (
        <SlabTable label="Waiting for approval">
          <thead>
            <tr>
              <th className={thClass}>Change</th>
              <th className={thClass}>Reason</th>
              <th className={thClass}>Drafted by</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {waiting.map(c => (
              <tr key={c.id} className={rowClass}>
                <td className={tdClass}>
                  {c.field === "fee_bps"
                    ? `Fee ${percent(c.oldValue)} to ${percent(c.newValue)}`
                    : `Status ${c.oldValue} to ${c.newValue}`}
                </td>
                <td className={tdClass}>{c.reason}</td>
                <td className={tdClass}>#{c.draftedById}</td>
                <td className={`${tdClass} space-x-2 whitespace-nowrap`}>
                  <Button
                    disabled={!canChange || !ready || approve.isPending}
                    onClick={() => approve.mutate({ changeId: c.id, code })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!canChange || !ready || reason.trim().length < 3 || reject.isPending}
                    onClick={() => reject.mutate({ changeId: c.id, note: reason, code })}
                  >
                    Reject
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </SlabTable>
      )}

      {canChange && (
        <div className="grid gap-[21px] lg:grid-cols-2">
          <section className="prism-slab space-y-3 p-[21px]" aria-labelledby="business-check">
            <Eyebrow as="p">Before it takes payments</Eyebrow>
            <h3 id="business-check" className="font-bold">
              Business check
            </h3>
            {(
              [
                ["registration", "Company registration checked"],
                ["beneficialOwners", "Beneficial owners identified"],
                ["sanctionsScreen", "Company, owners and payout wallet screened for sanctions"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-touch items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={check[key] || (m.businessCheck?.[key] ?? false)}
                  onChange={e => setCheck({ ...check, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <Button
              variant="secondary"
              disabled={!ready || record.isPending}
              onClick={() =>
                record.mutate({
                  id,
                  registration: check.registration || (m.businessCheck?.registration ?? false),
                  beneficialOwners:
                    check.beneficialOwners || (m.businessCheck?.beneficialOwners ?? false),
                  sanctionsScreen:
                    check.sanctionsScreen || (m.businessCheck?.sanctionsScreen ?? false),
                  code,
                })
              }
            >
              Save business check
            </Button>
          </section>

          <section className="prism-slab space-y-3 p-[21px]" aria-labelledby="merchant-changes">
            <Eyebrow as="p">Needs a second admin</Eyebrow>
            <h3 id="merchant-changes" className="font-bold">
              Status and fee
            </h3>
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Reason
              <Input value={reason} onChange={e => setReason(e.target.value)} className="h-touch" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  !ready || reason.trim().length < 3 || m.status === "active" || draft.isPending
                }
                onClick={() => draft.mutate({ id, field: "status", value: "active", reason, code })}
              >
                Turn on payments
              </Button>
              <Button
                variant="secondary"
                disabled={
                  !ready || reason.trim().length < 3 || m.status !== "active" || draft.isPending
                }
                onClick={() =>
                  draft.mutate({ id, field: "status", value: "suspended", reason, code })
                }
              >
                Suspend
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-prism-label font-semibold">
                New fee (bps)
                <Input
                  inputMode="numeric"
                  value={fee}
                  onChange={e => setFee(e.target.value.replace(/\D/g, ""))}
                  className="h-touch max-w-[140px]"
                />
              </label>
              <Button
                variant="secondary"
                disabled={!ready || reason.trim().length < 3 || !fee || draft.isPending}
                onClick={() => draft.mutate({ id, field: "fee_bps", value: fee, reason, code })}
              >
                Draft fee change
              </Button>
            </div>
            <p className="flex items-start gap-2 text-prism-label text-prism-ink-2">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              Merchant fees sit between {percent(AMPEDPAY_CONTRACT.defaults.feeFloorBps)} and{" "}
              {percent(AMPEDPAY_CONTRACT.MAX_MERCHANT_FEE_BPS)}. The contract refuses anything
              higher.
            </p>
          </section>

          <section className="prism-slab space-y-3 p-[21px]" aria-labelledby="merchant-members">
            <h3 id="merchant-members" className="font-bold">
              Members
            </h3>
            <ul className="space-y-1">
              {m.members.map(x => (
                <li key={x.userId} className="flex min-h-touch items-center justify-between">
                  <span>Account #{x.userId}</span>
                  <WordBadge tone="ink">{x.role}</WordBadge>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-prism-label font-semibold">
                Amped.Bio account id
                <Input
                  inputMode="numeric"
                  value={memberId}
                  onChange={e => setMemberId(e.target.value.replace(/\D/g, ""))}
                  className="h-touch max-w-[160px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-prism-label font-semibold">
                Role
                <select
                  className="prism-focus h-touch rounded-[13px] px-3"
                  value={memberRole}
                  onChange={e => setMemberRole(e.target.value as MerchantRole)}
                >
                  {MERCHANT_ROLES.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                disabled={!ready || !memberId || member.isPending}
                onClick={() =>
                  member.mutate({ id, userId: Number(memberId), role: memberRole, code })
                }
              >
                Save member
              </Button>
            </div>
          </section>
        </div>
      )}

      <SlabTable label="Audit log">
        <thead>
          <tr>
            <th className={thClass}>When</th>
            <th className={thClass}>Who</th>
            <th className={thClass}>What</th>
          </tr>
        </thead>
        <tbody>
          {m.audit.length === 0 ? (
            <SlabMessageRow columns={3}>Nothing yet.</SlabMessageRow>
          ) : (
            m.audit.map((a, i) => (
              <tr key={i} className={rowClass}>
                <td className={tdClass}>{new Date(a.createdAt).toLocaleString()}</td>
                <td className={tdClass}>{a.actorId === 0 ? "System" : `#${a.actorId}`}</td>
                <td className={tdClass}>{a.action}</td>
              </tr>
            ))
          )}
        </tbody>
      </SlabTable>
    </section>
  );
}
