/**
 * Store tab, Membership (MB-2, Screen Review row 160, board st4; memberships decision 6 and 7,
 * amendment 1 3.1). The one plan: name, description, up to six benefits, the amount every 30
 * days and an optional yearly amount with the saving line, Show member count, and Activate or
 * Pause. "New amounts apply to new members only." People, Members keeps the member list.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  MEMBERSHIP_COPY,
  MEMBERSHIP_LIMITS,
  PLATFORM_FEE_BPS,
  dollarsToUnits,
  usdcDollarsLabel,
  yearlySavingPercent,
  type MembershipPlanOut,
} from "@repo/constants";
import {
  Button,
  Input,
  Notice,
  Skeleton,
  Switch,
  Textarea,
  queryClient,
  trpc,
  trpcClient,
} from "@repo/ui";

function dollarsText(units: string | null | undefined) {
  if (!units) return "";
  const value = BigInt(units);
  const whole = value / 1_000_000n;
  const cents = (value % 1_000_000n) / 10_000n;
  return cents ? `${whole}.${cents.toString().padStart(2, "0")}` : whole.toString();
}

function errorText(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "That change could not be saved.";
}

export function MembershipTab() {
  const plan = useQuery(trpc.memberships.plan.get.queryOptions());
  if (plan.isLoading) {
    return (
      <div aria-busy aria-label="Loading membership" className="space-y-3">
        <Skeleton className="h-[320px] w-full rounded-prism-21" />
      </div>
    );
  }
  return <PlanEditor plan={plan.data ?? null} />;
}

function PlanEditor({ plan }: { plan: MembershipPlanOut | null }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [benefits, setBenefits] = useState<string[]>(plan?.benefits.length ? plan.benefits : [""]);
  const [every30, setEvery30] = useState(dollarsText(plan?.amountEvery30Days));
  const [yearly, setYearly] = useState(dollarsText(plan?.amountYearly));
  const [showCount, setShowCount] = useState(plan?.showMemberCount ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setSaved(false), [name, description, benefits, every30, yearly, showCount]);

  const every30Units = dollarsToUnits(every30);
  const yearlyUnits = yearly.trim() ? dollarsToUnits(yearly) : null;
  const saving =
    every30Units && yearlyUnits ? yearlySavingPercent(every30Units, yearlyUnits) : null;
  const perRenewal =
    every30Units !== null
      ? every30Units - (every30Units * BigInt(PLATFORM_FEE_BPS)) / 10_000n
      : null;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.memberships.plan.get.queryKey() });

  const save = useMutation({
    mutationFn: () =>
      trpcClient.memberships.plan.upsert.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        benefits: benefits.map(b => b.trim()).filter(Boolean),
        amountEvery30Days: (every30Units ?? 0n).toString(),
        amountYearly: yearlyUnits === null ? null : yearlyUnits.toString(),
        showMemberCount: showCount,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void refresh();
    },
    onError: failure => setError(errorText(failure)),
  });
  const setStatus = useMutation({
    mutationFn: (status: "active" | "paused") =>
      trpcClient.memberships.plan.setStatus.mutate({ status }),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: failure => setError(errorText(failure)),
  });

  const canSave =
    name.trim().length > 0 &&
    every30Units !== null &&
    (yearly.trim() === "" || yearlyUnits !== null);
  const status = plan?.status ?? "draft";

  return (
    <section className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <h2 className="text-prism-h3 font-bold text-prism-ink">
          {plan ? "Your membership" : "Set up a membership"}
        </h2>
        {plan ? (
          <span className="inline-flex h-6 items-center rounded-full bg-prism-nav-tint px-2 text-[13px] font-semibold text-prism-ink">
            {status === "active" ? "Taking members" : status === "paused" ? "Paused" : "Draft"}
          </span>
        ) : null}
      </div>
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}

      <label className="flex flex-col gap-[6px] text-prism-label text-prism-ink">
        <span className="font-bold">Name</span>
        <Input
          value={name}
          maxLength={MEMBERSHIP_LIMITS.nameMax}
          onChange={e => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-[6px] text-prism-label text-prism-ink">
        <span className="font-bold">Description</span>
        <Textarea
          value={description}
          rows={3}
          maxLength={MEMBERSHIP_LIMITS.descriptionMax}
          onChange={e => setDescription(e.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-[8px]">
        <legend className="mb-[6px] text-prism-label font-bold text-prism-ink">
          What members get
        </legend>
        {benefits.map((benefit, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Benefit ${index + 1}`}
              value={benefit}
              maxLength={MEMBERSHIP_LIMITS.benefitMax}
              onChange={e =>
                setBenefits(list => list.map((b, i) => (i === index ? e.target.value : b)))
              }
            />
            {benefits.length > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove benefit ${index + 1}`}
                onClick={() => setBenefits(list => list.filter((_, i) => i !== index))}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {benefits.length < MEMBERSHIP_LIMITS.benefitsMax ? (
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setBenefits(list => [...list, ""])}
          >
            <Plus aria-hidden />
            Add a benefit
          </Button>
        ) : null}
      </fieldset>

      <div className="grid gap-[13px] sm:grid-cols-2">
        <label className="flex flex-col gap-[6px] text-prism-label text-prism-ink">
          <span className="font-bold">Every 30 days, USDC</span>
          <Input
            inputMode="decimal"
            value={every30}
            placeholder="5"
            onChange={e => setEvery30(e.target.value)}
          />
          <span className="text-prism-caption text-prism-ink/70">$1 to $500 USDC</span>
        </label>
        <label className="flex flex-col gap-[6px] text-prism-label text-prism-ink">
          <span className="font-bold">A year, USDC (optional)</span>
          <Input
            inputMode="decimal"
            value={yearly}
            placeholder="48"
            onChange={e => setYearly(e.target.value)}
          />
          <span className="text-prism-caption text-prism-ink/70">
            {saving ? `Members save ${saving}% a year.` : "$10 to $5,000 USDC"}
          </span>
        </label>
      </div>
      {perRenewal !== null ? (
        <p className="text-prism-meta text-prism-ink-2">
          You receive {usdcDollarsLabel(perRenewal)} per renewal after the Amped.Bio fee of{" "}
          {PLATFORM_FEE_BPS / 100}%.
        </p>
      ) : null}
      {plan ? (
        <p className="text-prism-meta text-prism-ink-2">{MEMBERSHIP_COPY.newAmounts}</p>
      ) : null}

      <Switch
        checked={showCount}
        onChange={setShowCount}
        label="Show member count"
        description="Shown from 10 members."
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          {saved ? "Saved" : plan ? "Save" : "Create membership"}
        </Button>
        {plan && status !== "active" ? (
          <Button
            variant="secondary"
            onClick={() => setStatus.mutate("active")}
            disabled={setStatus.isPending}
          >
            Start taking members
          </Button>
        ) : null}
        {plan && status === "active" ? (
          <Button
            variant="secondary"
            onClick={() => setStatus.mutate("paused")}
            disabled={setStatus.isPending}
          >
            Pause new members
          </Button>
        ) : null}
      </div>
      {plan && status === "paused" ? (
        <p className="text-prism-meta text-prism-ink-2">
          Paused stops new members. Current members keep their membership.
        </p>
      ) : null}
    </section>
  );
}
