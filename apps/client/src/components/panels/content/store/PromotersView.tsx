/**
 * Store tab, Sales, Promoters (content PR C12; content spec 3.9 Promoters, decision 20; st5).
 * The creator's codes: who, the share, which products, sales through the code and what the
 * promoter earned, with Copy link, Pause, Turn back on and End. A sheet makes or edits a
 * code and carries the FTC line. Under it, the codes this account promotes for others.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Megaphone, MoreHorizontal, Plus } from "lucide-react";
import {
  PROMOTER_COPY,
  bpsPercent,
  promoterStoreLink,
  usdcDollarsLabel,
  type PromoterCodeRow,
  type PromoterScope,
} from "@repo/constants";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  EmptyState,
  ErrorCard,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  Skeleton,
  cn,
  queryClient,
  trpc,
  useAuth,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";

const P = PROMOTER_COPY;
const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "";

const STATUS_TONE: Record<PromoterCodeRow["status"], string> = {
  active: "bg-prism-nav-tint text-prism-ink",
  paused: "bg-prism-warning-bg text-prism-warning-ink",
  ended: "bg-prism-line text-prism-ink-2",
};

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Not saved. Check your connection.";
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: "success", title: P.copied });
  } catch {
    toast.add({ type: "error", title: text });
  }
}

const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.store.promoters.pathKey() });

export function PromotersView() {
  const { authUser } = useAuth();
  const codes = useQuery(trpc.store.promoters.list.queryOptions());
  const [editing, setEditing] = useState<PromoterCodeRow | "new" | null>(null);
  const [ending, setEnding] = useState<PromoterCodeRow | null>(null);
  const setStatus = useMutation({
    ...trpc.store.promoters.setStatus.mutationOptions(),
    onSuccess: () => void refresh(),
    onError: error => toast.add({ type: "error", title: errorText(error) }),
  });
  const handle = authUser?.handle ?? "";

  return (
    <div className="mt-[21px] space-y-[21px]">
      <section
        aria-labelledby="promoters-title"
        className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]"
      >
        <div className="flex flex-wrap items-center justify-between gap-[8px]">
          <div>
            <h2 id="promoters-title" className="text-prism-h3 font-bold text-prism-ink">
              {P.title}
            </h2>
            <p className="text-prism-meta text-prism-ink-2">{P.intro}</p>
          </div>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="h-4 w-4" />
            {P.newCode}
          </Button>
        </div>

        {codes.isPending ? (
          <div aria-busy className="space-y-2">
            <Skeleton className="h-[64px] w-full rounded-prism-13" />
            <Skeleton className="h-[64px] w-full rounded-prism-13" />
          </div>
        ) : codes.isError ? (
          <ErrorCard
            title="Promoter codes did not load"
            cause="Check your connection, then try again."
            retryLabel="Retry"
            onRetry={() => void codes.refetch()}
          />
        ) : codes.data.length === 0 ? (
          <EmptyState icon={Megaphone} title={P.empty} description={P.emptyBody} />
        ) : (
          <ul className="prism-slab divide-y divide-prism-line rounded-prism-21">
            {codes.data.map(row => (
              <li key={row.id} className="flex flex-wrap items-center gap-[13px] p-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink">
                    <span className="font-prism-mono">{row.code}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-prism-meta font-semibold",
                        STATUS_TONE[row.status]
                      )}
                    >
                      {P.statuses[row.status]}
                    </span>
                  </p>
                  <p className="text-prism-meta text-prism-ink-2">
                    @{row.promoter.handle}, {bpsPercent(row.bps)},{" "}
                    {row.scope === "all"
                      ? P.fields.scopeAll
                      : `${row.scope.length} ${row.scope.length === 1 ? "product" : "products"}`}
                  </p>
                  <p className="text-prism-meta text-prism-ink-2">
                    {P.sales(row.sales)}, {P.earned(usdcDollarsLabel(row.promoterEarned))}
                  </p>
                  {row.pausedReason === "refunds" && row.status === "paused" && (
                    <p className="text-prism-meta font-semibold text-prism-warning-ink">
                      {P.pausedRefunds}
                    </p>
                  )}
                </div>
                {row.status !== "ended" && (
                  <Button
                    variant="ghost"
                    onClick={() => void copy(promoterStoreLink(LANDING, handle, row.code))}
                  >
                    <Copy aria-hidden className="h-4 w-4" />
                    {P.actions.copyLink}
                  </Button>
                )}
                {row.status !== "ended" && (
                  <Menu>
                    <MenuTrigger
                      aria-label={`Actions for ${row.code}`}
                      className="prism-icon-btn prism-focus"
                    >
                      <MoreHorizontal aria-hidden className="h-5 w-5 text-prism-ink-2" />
                    </MenuTrigger>
                    <MenuContent align="end" className="min-w-[189px]">
                      <MenuItem onSelect={() => setEditing(row)}>{P.actions.edit}</MenuItem>
                      {row.status === "active" ? (
                        <MenuItem
                          onSelect={() => setStatus.mutate({ id: row.id, status: "paused" })}
                        >
                          {P.actions.pause}
                        </MenuItem>
                      ) : (
                        <MenuItem
                          onSelect={() => setStatus.mutate({ id: row.id, status: "active" })}
                        >
                          {P.actions.resume}
                        </MenuItem>
                      )}
                      <MenuItem onSelect={() => setEnding(row)}>{P.actions.end}</MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-prism-meta text-prism-ink-2">{P.refundNote}</p>
      </section>

      <PromotingSection />

      <CodeSheet value={editing} onClose={() => setEditing(null)} />

      <BottomSheet open={!!ending} onOpenChange={open => !open && setEnding(null)}>
        <BottomSheetContent title={`${P.actions.end} ${ending?.code ?? ""}`}>
          <div className="space-y-[13px] px-[21px] pb-[21px]">
            <p className="text-prism-body text-prism-ink">{P.endConfirm}</p>
            <Button
              variant="destructive"
              className="w-full"
              disabled={setStatus.isPending}
              onClick={() => {
                if (ending) setStatus.mutate({ id: ending.id, status: "ended" });
                setEnding(null);
              }}
            >
              {P.actions.end}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setEnding(null)}>
              Keep code
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/** The codes other creators gave this account. Hidden until there is one. */
function PromotingSection() {
  const mine = useQuery(trpc.store.promoter.mine.queryOptions());
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <section
      aria-labelledby="promoting-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]"
    >
      <div>
        <h2 id="promoting-title" className="text-prism-h3 font-bold text-prism-ink">
          {P.mine.title}
        </h2>
        <p className="text-prism-meta text-prism-ink-2">{P.mine.intro}</p>
      </div>
      <ul className="prism-slab divide-y divide-prism-line rounded-prism-21">
        {mine.data.map(row => {
          const link = promoterStoreLink(LANDING, row.creator.handle, row.code);
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-[13px] p-[13px]">
              <div className="min-w-0 flex-1">
                <p className="text-prism-label font-semibold text-prism-ink">
                  @{row.creator.handle}, <span className="font-prism-mono">{row.code}</span>
                </p>
                <p className="text-prism-meta text-prism-ink-2">
                  {bpsPercent(row.bps)}, {P.statuses[row.status]}, {P.sales(row.sales)},{" "}
                  {P.mine.earned(usdcDollarsLabel(row.earned))}
                </p>
              </div>
              {row.status === "active" && (
                <Button variant="ghost" onClick={() => void copy(link)}>
                  <Copy aria-hidden className="h-4 w-4" />
                  {P.actions.copyLink}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-prism-meta text-prism-ink-2">{P.ftc}</p>
    </section>
  );
}

function CodeSheet({
  value,
  onClose,
}: {
  value: PromoterCodeRow | "new" | null;
  onClose: () => void;
}) {
  const editing = value && value !== "new" ? value : null;
  const bounds = useQuery({ ...trpc.store.promoters.bounds.queryOptions(), enabled: !!value });
  const products = useQuery({ ...trpc.store.products.list.queryOptions(), enabled: !!value });
  const plan = useQuery({ ...trpc.memberships.plan.get.queryOptions(), enabled: !!value });
  const [handle, setHandle] = useState("");
  const [share, setShare] = useState("10");
  const [all, setAll] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [ends, setEnds] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    setError(null);
    if (editing) {
      setShare(String(editing.bps / 100));
      setAll(editing.scope === "all");
      setChosen(editing.scope === "all" ? [] : editing.scope);
      setEnds(editing.expiresAt ? editing.expiresAt.slice(0, 10) : "");
    } else {
      setHandle("");
      setShare("10");
      setAll(true);
      setChosen([]);
      setCode("");
      setEnds("");
    }
  }, [value, editing]);

  const save = useMutation({
    ...trpc.store.promoters.upsert.mutationOptions(),
    onSuccess: () => {
      void refresh();
      onClose();
    },
    onError: e => setError(errorText(e)),
  });

  const options = [
    ...(products.data ?? [])
      .filter(p => p.status !== "archived")
      .map(p => ({ id: p.id, label: p.title })),
    ...(plan.data ? [{ id: plan.data.id, label: `${plan.data.name} (membership)` }] : []),
  ];
  const bps = Math.round(Number(share) * 100);
  const valid =
    Number.isFinite(bps) &&
    bps > 0 &&
    (editing || handle.trim().length > 0) &&
    (all || chosen.length > 0);

  const submit = () => {
    setError(null);
    const scope: PromoterScope = all ? "all" : chosen;
    save.mutate({
      ...(editing ? { id: editing.id } : { promoterHandle: handle.trim() }),
      ...(!editing && code.trim() ? { code: code.trim() } : {}),
      bps,
      scope,
      expiresAt: ends ? new Date(`${ends}T23:59:59Z`).toISOString() : null,
    });
  };

  return (
    <BottomSheet open={!!value} onOpenChange={open => !open && onClose()}>
      <BottomSheetContent title={editing ? `${P.actions.edit} ${editing.code}` : P.newCode}>
        <form
          className="space-y-[21px] px-[21px] pb-[21px]"
          onSubmit={event => {
            event.preventDefault();
            if (valid) submit();
          }}
        >
          {!editing && (
            <label className="block space-y-2">
              <span className="block text-prism-label font-semibold text-prism-ink">
                {P.fields.promoter}
              </span>
              <Input
                value={handle}
                onChange={e => setHandle(e.target.value)}
                placeholder="@handle"
                autoComplete="off"
              />
              <span className="block text-prism-meta text-prism-ink-2">
                {P.fields.promoterHelp}
              </span>
            </label>
          )}
          <label className="block space-y-2">
            <span className="block text-prism-label font-semibold text-prism-ink">
              {P.fields.share}
            </span>
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                value={share}
                onChange={e => setShare(e.target.value)}
                className="w-[96px]"
              />
              <span className="text-prism-label text-prism-ink">%</span>
            </div>
            {bounds.data && (
              <span className="block text-prism-meta text-prism-ink-2">
                {P.fields.shareHelp(bounds.data.min, bounds.data.max)}
              </span>
            )}
          </label>
          <fieldset className="space-y-2">
            <legend className="text-prism-label font-semibold text-prism-ink">
              {P.fields.scope}
            </legend>
            <label className="flex min-h-touch items-center gap-3">
              <input type="radio" checked={all} onChange={() => setAll(true)} />
              <span className="text-prism-label text-prism-ink">{P.fields.scopeAll}</span>
            </label>
            <label className="flex min-h-touch items-center gap-3">
              <input type="radio" checked={!all} onChange={() => setAll(false)} />
              <span className="text-prism-label text-prism-ink">{P.fields.scopeChosen}</span>
            </label>
            {!all && (
              <ul className="prism-slab divide-y divide-prism-line rounded-prism-13 px-[13px]">
                {options.map(option => (
                  <li key={option.id}>
                    <label className="flex min-h-touch items-center gap-3">
                      <input
                        type="checkbox"
                        checked={chosen.includes(option.id)}
                        onChange={e =>
                          setChosen(list =>
                            e.target.checked
                              ? [...list, option.id]
                              : list.filter(id => id !== option.id)
                          )
                        }
                      />
                      <span className="text-prism-label text-prism-ink">{option.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          {!editing && (
            <label className="block space-y-2">
              <span className="block text-prism-label font-semibold text-prism-ink">
                {P.fields.code}
              </span>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={16}
                autoComplete="off"
              />
              <span className="block text-prism-meta text-prism-ink-2">{P.fields.codeHelp}</span>
            </label>
          )}
          <label className="block space-y-2">
            <span className="block text-prism-label font-semibold text-prism-ink">
              {P.fields.ends}
            </span>
            <Input type="date" value={ends} onChange={e => setEnds(e.target.value)} />
            <span className="block text-prism-meta text-prism-ink-2">{P.fields.endsHelp}</span>
          </label>
          <Notice variant="info">{P.ftc}</Notice>
          {error && <Notice variant="warning">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={!valid || save.isPending}>
            {P.actions.save}
          </Button>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
