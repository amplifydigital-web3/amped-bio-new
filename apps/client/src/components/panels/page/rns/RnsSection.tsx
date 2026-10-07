import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  formatRnsDate,
  trpcClient,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import {
  MY_PAGE_IDENTITY_KEY,
  useMyPageIdentity,
  useMyRnsNames,
  type MyPageIdentity,
  type RnsDisplay,
} from "./useMyPageIdentity";

// Screen Review 108: Page > Revolution Name Service (RNS). Its own G1 clear
// card under the profile header card (I12). The name is chosen from the
// account wallet's names (I03) and saved through user.setRnsName (I01). The
// display switches autosave 800ms after a change (I04, D11) and the public
// page applies them on the server.

const SAVE_DELAY_MS = 800;

const dateFromSeconds = (seconds: number) => formatRnsDate(new Date(seconds * 1000).toISOString());

function StatusLine({
  tone,
  lead,
  children,
  action,
}: {
  tone: "success" | "warning";
  lead?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-start gap-2">
      <Icon
        aria-hidden
        className={
          tone === "success"
            ? "mt-px h-4 w-4 shrink-0 text-prism-success"
            : "mt-px h-4 w-4 shrink-0 text-prism-warning-ink"
        }
      />
      <p className="text-prism-meta text-prism-ink">
        {lead && <span className="font-semibold">{lead} </span>}
        {children}
        {action}
      </p>
    </div>
  );
}

function RetryLine({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="text-prism-meta text-prism-ink">{text}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <RotateCcw aria-hidden />
        Retry
      </Button>
    </div>
  );
}

/** 108 I15: the stored name expired or is no longer the owner's */
function LostNameNotice({
  name,
  expired,
  onManage,
  onDismiss,
}: {
  name: string;
  expired: boolean;
  onManage: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className="prism-notice flex items-start gap-3">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
      />
      <div className="min-w-0 flex-1 text-[16px] leading-6">
        <p className="font-bold text-prism-warning-ink">
          {expired ? "Your RNS name expired" : "Your RNS name is no longer yours"}
        </p>
        <p className="text-prism-ink">
          <span className="break-all">{name}</span> no longer shows on your page. Renew it in Wallet
          or pick another RNS name.
        </p>
        <Button variant="ghost" className="-ml-3 mt-1" onClick={onManage}>
          Manage in Wallet
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="prism-icon-btn prism-focus shrink-0"
      >
        <X aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
      </button>
    </div>
  );
}

/** Display settings with an 800ms autosave. The last value wins. */
function useDisplaySettings(server: RnsDisplay | undefined) {
  const queryClient = useQueryClient();
  const [display, setDisplay] = useState<RnsDisplay | undefined>(server);
  const [failed, setFailed] = useState(false);
  const pending = useRef<RnsDisplay | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pending.current) setDisplay(server);
  }, [server]);

  const save = async () => {
    const next = pending.current;
    if (!next) return;
    try {
      const saved = await trpcClient.user.setRnsDisplay.mutate(next);
      if (pending.current === next) pending.current = null;
      setFailed(false);
      queryClient.setQueryData<MyPageIdentity>(MY_PAGE_IDENTITY_KEY, current =>
        current ? { ...current, display: saved } : current
      );
      void queryClient.invalidateQueries({ queryKey: MY_PAGE_IDENTITY_KEY });
    } catch {
      setFailed(true);
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Best-effort save before leaving. Failures are logged but do not block
      // the transition; the saved state is still shown on the next visit.
      if (pending.current) {
        void trpcClient.user.setRnsDisplay
          .mutate(pending.current)
          .catch(() => console.warn("[RnsSection] Display settings save on leave failed"));
      }
    },
    []
  );

  const update = (next: RnsDisplay) => {
    setDisplay(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  return { display, update, failed, retry: () => void save() };
}

export function RnsSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSavedRevoName } = useEditor();
  const identity = useMyPageIdentity();
  const names = useMyRnsNames();
  const {
    display,
    update,
    failed: displayFailed,
    retry: retryDisplay,
  } = useDisplaySettings(identity.data?.display);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const labelId = useId();
  const statusId = useId();

  // Kit skeletons appear after 400ms only
  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // Keep the editor's copy of the stored name current (Wallet transfer reads it)
  const storedName = identity.data?.name ?? "";
  useEffect(() => {
    if (identity.data) setSavedRevoName(storedName);
  }, [identity.data, storedName, setSavedRevoName]);

  const goToWallet = () => navigate("/wallet?tab=rns");
  const goToIdentity = (label: string) =>
    navigate(`/wallet?tab=rns&name=${encodeURIComponent(label)}&view=identity`);

  const chooseName = async (label: string) => {
    setNameError(null);
    setSaving(true);
    try {
      const result = await trpcClient.user.setRnsName.mutate({ label });
      setSavedRevoName(result.label);
      setDismissed(false);
      await queryClient.invalidateQueries({ queryKey: MY_PAGE_IDENTITY_KEY });
    } catch (error) {
      setNameError(
        error instanceof Error && error.message
          ? error.message
          : "We could not save this RNS name. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const clearName = async () => {
    try {
      await trpcClient.user.setRnsName.mutate({ label: null });
      setDismissed(true);
      await queryClient.invalidateQueries({ queryKey: MY_PAGE_IDENTITY_KEY });
    } catch {
      setNameError("We could not update your page. Try again.");
    }
  };

  const data = identity.data;
  const list = names.data?.names ?? [];
  const label = data?.label ?? null;
  const owned = label ? list.find(item => item.label === label) : undefined;
  const verification = data?.verification;
  const verified = verification?.state === "verified";
  const validUntil =
    verification?.state === "verified" ? formatRnsDate(verification.validUntil) : null;

  // P08: expired, or the name left the wallet
  const lost =
    !!data?.name &&
    !dismissed &&
    (data.nameState === "expired" ||
      (data.nameState === "not_linked" && names.isSuccess && !owned));
  const selectable = label && data?.nameState !== "expired" && !lost ? label : "";

  // ── P02: the RNS name field ──────────────────────────────────
  let field: React.ReactNode;
  if (names.isPending || identity.isPending) {
    field = showSkeleton ? <Skeleton className="h-touch w-full rounded-prism-13" /> : null;
  } else if (names.isError) {
    field = <RetryLine text="Your RNS names did not load." onRetry={() => void names.refetch()} />;
  } else if (!names.data?.wallet) {
    field = (
      <p className="text-prism-meta text-prism-ink-2">
        Add a wallet in Wallet to use an RNS name.{" "}
        <Button variant="link" className="h-auto min-h-0 p-0 text-prism-meta" onClick={goToWallet}>
          Go to Wallet
        </Button>
      </p>
    );
  } else if (list.length === 0) {
    field = (
      <p className="text-prism-meta text-prism-ink-2">
        You have no RNS names yet.{" "}
        <Button variant="link" className="h-auto min-h-0 p-0 text-prism-meta" onClick={goToWallet}>
          Get an RNS name
        </Button>
      </p>
    );
  } else {
    const selected = list.find(item => item.label === selectable);
    field = (
      <Select value={selectable} onValueChange={value => void chooseName(value)} disabled={saving}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-describedby={nameError ? `${labelId}-error` : statusId}
          className="w-full"
        >
          <SelectValue placeholder="Choose an RNS name">
            {selected && (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{selected.name}</span>
                {verified && <Badge variant="success">Verified</Badge>}
                {selected.isPrimary && <Badge variant="secondary">Primary</Badge>}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {list.map(item => (
            <SelectItem key={item.label} value={item.label} disabled={item.state !== "linked"}>
              <span className="flex flex-col">
                <span>{item.name}</span>
                <span className="text-prism-meta text-prism-ink-2">
                  {item.state === "expired"
                    ? `Expired ${dateFromSeconds(item.expiry) ?? ""}`.trim()
                    : item.state === "not_linked"
                      ? "Points to another wallet"
                      : item.state === "unavailable"
                        ? "Could not check"
                        : `Active until ${dateFromSeconds(item.expiry) ?? ""}`.trim()}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // ── P03: the state of the stored name now ────────────────────
  let status: React.ReactNode = null;
  if (label && !lost) {
    if (identity.isFetching && !data) {
      status = showSkeleton ? <Skeleton className="h-4 w-2/3 rounded-prism-8" /> : null;
    } else if (data?.nameState === "linked") {
      status = (
        <StatusLine tone="success" lead="Linked.">
          This name points to this page's wallet.
        </StatusLine>
      );
    } else if (data?.nameState === "not_linked") {
      status = (
        <StatusLine
          tone="warning"
          lead="Not linked."
          action={
            <Button
              variant="link"
              className="ml-1 h-auto min-h-0 p-0 text-prism-meta"
              onClick={goToWallet}
            >
              Manage in Wallet
            </Button>
          }
        >
          {data.name} points to another wallet, so it does not show on your page.
        </StatusLine>
      );
    } else if (data?.nameState === "unavailable") {
      status = (
        <RetryLine
          text="We could not check this RNS name."
          onRetry={() => void identity.refetch()}
        />
      );
    }
  }

  const linked = data?.nameState === "linked";

  // ── P05: the badge row ───────────────────────────────────────
  let badgeRow: React.ReactNode = null;
  if (display && linked && verification) {
    if (verification.state === "verified") {
      badgeRow = (
        <Switch
          checked={display.showBadge}
          onChange={showBadge => update({ ...display, showBadge })}
          label="Show Verified badge"
          description={
            validUntil ? `Verified by Authbase until ${validUntil}` : "Verified by Authbase"
          }
        />
      );
    } else if (verification.state === "not_verified") {
      badgeRow = (
        <div className="flex min-h-touch flex-wrap items-center gap-[13px]">
          <Badge variant="secondary">Not verified</Badge>
          <Button variant="ghost" onClick={() => label && goToIdentity(label)}>
            Get verified
          </Button>
        </div>
      );
    } else if (verification.state === "unavailable") {
      badgeRow = (
        <RetryLine
          text="We could not check your verification."
          onRetry={() => void identity.refetch()}
        />
      );
    }
  }

  return (
    <section
      aria-labelledby={`${labelId}-title`}
      className="prism-glass-clear space-y-[21px] !rounded-prism-21 p-[21px] font-prism"
    >
      <header className="space-y-2">
        <p className="text-prism-meta font-semibold uppercase tracking-[0.08em] text-prism-ink-2">
          Identity on your page
        </p>
        <h2 id={`${labelId}-title`} className="text-[20px] font-bold leading-[23px] text-prism-ink">
          Revolution Name Service (RNS)
        </h2>
        <p className="text-prism-meta text-prism-ink-2">
          Choose the RNS name your page shows and what fans can see.
        </p>
      </header>

      {lost && data?.name && (
        <LostNameNotice
          name={data.name}
          expired={data.nameState === "expired"}
          onManage={goToWallet}
          onDismiss={() => void clearName()}
        />
      )}

      <div className="space-y-2">
        <p id={labelId} className="text-prism-label font-semibold text-prism-ink">
          RNS name
        </p>
        {field}
        {nameError && (
          <p id={`${labelId}-error`} role="alert" className="text-prism-meta text-prism-danger">
            {nameError}
          </p>
        )}
        <div id={statusId}>{status}</div>
      </div>

      {display && linked && (
        <div className="space-y-1">
          <Switch
            checked={display.showName}
            onChange={showName => update({ ...display, showName })}
            label="Show on my page"
            description="Fans see the RNS name under your display name."
          />
          {display.showName && badgeRow}
        </div>
      )}

      {display && linked && display.showName && (
        <div className="space-y-1">
          <p className="text-prism-meta font-semibold uppercase tracking-[0.08em] text-prism-ink-2">
            In the identity sheet
          </p>
          <Switch
            checked={display.details.name}
            onChange={name => update({ ...display, details: { ...display.details, name } })}
            label="RNS name"
          />
          <Switch
            checked={display.details.wallet}
            onChange={wallet => update({ ...display, details: { ...display.details, wallet } })}
            label="Your wallet address"
            description="Fans can copy it."
          />
          {verified && (
            <Switch
              checked={display.details.check}
              onChange={check => update({ ...display, details: { ...display.details, check } })}
              label="Check dates and level"
            />
          )}
          <p className="pt-1 text-prism-meta text-prism-ink-2">
            Fans see these only when they turn on Show details.
          </p>
        </div>
      )}

      {displayFailed && <RetryLine text="Could not save." onRetry={retryDisplay} />}

      <Button variant="ghost" className="-ml-3" onClick={goToWallet}>
        Manage in Wallet
      </Button>
    </section>
  );
}
