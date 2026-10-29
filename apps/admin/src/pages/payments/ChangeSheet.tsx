import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  ChipGroup,
  Input,
  Notice,
  ReviewSlab,
  SidePanel,
  StepBar,
  Textarea,
  trpc,
} from "@repo/ui";
import { FEE_INCREASE_NOTICE_DAYS } from "@repo/constants";
import { formatDay, formatDayTime } from "../../kit/format";
import {
  bpsToPercent,
  percentToBps,
  unitsToUsdc,
  usdcToUnits,
  who,
  type PaymentChange,
  type PaymentSettingRow,
  type PaymentsViewer,
} from "./shared";

// Board a3 (spec 3.8): the change sheet. Draft: old to new, the allowed range, an effective
// date for the platform fee, a required reason and a two factor code. Review: the second
// payments admin checks the change and approves or rejects it. Nothing changes until a
// different payments admin approves (decision 1).

const STEPS = ["Draft", "Second admin", "Applies"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function TwoFactorField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Input
      label="Two factor code (Required)"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={event => onChange(event.target.value.replace(/\D/g, ""))}
      helper="The 6 digit code from your authenticator app."
      {...(error ? { error } : {})}
    />
  );
}

/* --------------------------------------------------------------------- inputs */

interface ValueState {
  a: string;
  b: string;
}

function initialInput(row: PaymentSettingRow): ValueState {
  const value = row.value ?? "";
  switch (row.kind) {
    case "bps":
      return { a: bpsToPercent(value), b: "" };
    case "usdc":
      return { a: unitsToUsdc(value), b: "" };
    case "usdc_range": {
      const [min = "0", max = "0"] = value.split(",");
      return { a: unitsToUsdc(min), b: unitsToUsdc(max) };
    }
    case "bps_range": {
      const [min = "0", max = "0"] = value.split(",");
      return { a: bpsToPercent(min), b: bpsToPercent(max) };
    }
    case "handles":
      return {
        a: value
          .split(",")
          .filter(Boolean)
          .map(handle => `@${handle}`)
          .join(", "),
        b: "",
      };
    default:
      return { a: value, b: "" };
  }
}

/** The stored encoding for the server, or an error to show under the field. */
function encode(row: PaymentSettingRow, input: ValueState): { value: string } | { error: string } {
  switch (row.kind) {
    case "bps": {
      const bps = percentToBps(input.a);
      return bps === null
        ? { error: "Enter a percent with up to 2 decimals, for example 4.50." }
        : { value: bps };
    }
    case "usdc": {
      const units = usdcToUnits(input.a);
      return units === null
        ? { error: "Enter an amount in USDC, for example 1000.00." }
        : { value: units };
    }
    case "usdc_range": {
      const min = usdcToUnits(input.a);
      const max = usdcToUnits(input.b);
      if (min === null || max === null) return { error: "Enter both amounts in USDC." };
      return { value: `${min},${max}` };
    }
    case "bps_range": {
      const min = percentToBps(input.a);
      const max = percentToBps(input.b);
      if (min === null || max === null)
        return { error: "Enter both percents, for example 1 and 30." };
      return { value: `${min},${max}` };
    }
    case "int":
      return /^\d+$/.test(input.a.trim())
        ? { value: input.a.trim() }
        : { error: "Enter a whole number." };
    default:
      return { value: input.a.trim() };
  }
}

function ValueFields({
  row,
  input,
  onChange,
  error,
}: {
  row: PaymentSettingRow;
  input: ValueState;
  onChange: (next: ValueState) => void;
  error?: string;
}) {
  const helper = `Allowed: ${row.allowed}.`;
  const errorProps = error ? { error } : {};
  switch (row.kind) {
    case "bool":
      return (
        <ChipGroup
          label="New value"
          value={input.a}
          onChange={value => onChange({ a: value, b: "" })}
          options={[
            { value: "true", label: "On" },
            { value: "false", label: "Off" },
          ]}
        />
      );
    case "usdc_range":
    case "bps_range": {
      const unit = row.kind === "usdc_range" ? "USDC" : "%";
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="New minimum"
            inputMode="decimal"
            value={input.a}
            onChange={event => onChange({ ...input, a: event.target.value })}
            trailing={<span className="pr-3 text-prism-label text-prism-ink-2">{unit}</span>}
            helper={helper}
            {...errorProps}
          />
          <Input
            label="New maximum"
            inputMode="decimal"
            value={input.b}
            onChange={event => onChange({ ...input, b: event.target.value })}
            trailing={<span className="pr-3 text-prism-label text-prism-ink-2">{unit}</span>}
          />
        </div>
      );
    }
    case "handles":
      return (
        <Textarea
          label="Pilot creators"
          rows={4}
          value={input.a}
          onChange={event => onChange({ a: event.target.value, b: "" })}
          helper="Handles separated by commas or spaces, for example @maya_lin, @dj-kai."
          {...errorProps}
        />
      );
    default: {
      const unit =
        row.kind === "bps"
          ? "%"
          : row.kind === "usdc"
            ? "USDC"
            : row.kind === "eth"
              ? "ETH"
              : (row.unit ?? "");
      return (
        <Input
          label="New value"
          inputMode={row.kind === "int" ? "numeric" : "decimal"}
          value={input.a}
          onChange={event => onChange({ a: event.target.value, b: "" })}
          trailing={
            unit ? (
              <span className="pr-3 text-prism-label text-prism-ink-2">{unit}</span>
            ) : undefined
          }
          helper={helper}
          {...errorProps}
        />
      );
    }
  }
}

/* ---------------------------------------------------------------------- draft */

function todayPlus(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function DraftSheet({
  row,
  open,
  onOpenChange,
  presetValue,
}: {
  row: PaymentSettingRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Resume opens the sheet with Off already chosen for Pause payments
  presetValue?: string;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState<ValueState>({ a: "", b: "" });
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    if (open && row) {
      setInput(presetValue !== undefined ? { a: presetValue, b: "" } : initialInput(row));
      setEffective("");
      setReason("");
      setCode("");
      setFieldError(undefined);
      setFormError(undefined);
    }
  }, [open, row, presetValue]);

  const draft = useMutation({
    ...trpc.admin.payments.changes.draft.mutationOptions(),
    onSuccess: () => {
      toast.success("Sent for approval. A different payments admin approves it.");
      void queryClient.invalidateQueries({ queryKey: trpc.admin.payments.pathKey() });
      onOpenChange(false);
    },
    onError: error => {
      setCode("");
      setFormError(errorMessage(error));
    },
  });

  if (!row) return null;
  const isFee = row.effectiveDate;

  const submit = () => {
    setFieldError(undefined);
    setFormError(undefined);
    const encoded = encode(row, input);
    if ("error" in encoded) {
      setFieldError(encoded.error);
      return;
    }
    if (reason.trim().length < 3) {
      setFormError("Give a reason the second admin can check.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setFormError("Enter the 6 digit code from your authenticator app.");
      return;
    }
    draft.mutate({
      key: row.id,
      value: encoded.value,
      reason: reason.trim(),
      effectiveAt: isFee && effective ? new Date(`${effective}T00:00:00Z`).toISOString() : null,
      code,
    });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={next => !draft.isPending && onOpenChange(next)}
      eyebrow="Change setting"
      title={row.id === "payments_paused" ? "Resume payments" : row.label}
      byline={row.hint ?? undefined}
      dismissible={!draft.isPending}
      footer={
        <div className="space-y-2">
          <Button
            className="h-commit w-full"
            onClick={submit}
            disabled={draft.isPending}
            aria-busy={draft.isPending || undefined}
          >
            Send for approval
          </Button>
          <p className="text-prism-meta text-prism-ink-2">
            Nothing changes until a different payments admin approves.
          </p>
        </div>
      }
    >
      <div className="space-y-5 font-prism">
        <StepBar steps={STEPS} current={0} />
        <ReviewSlab
          rows={[
            { label: "Now", value: row.valueText },
            ...(row.lastChange
              ? [{ label: "Last change", value: formatDay(row.lastChange.appliedAt) }]
              : []),
          ]}
        />
        {row.id !== "payments_paused" && (
          <ValueFields
            row={row}
            input={input}
            onChange={next => {
              setInput(next);
              setFieldError(undefined);
            }}
            {...(fieldError ? { error: fieldError } : {})}
          />
        )}
        {row.id === "payments_paused" && (
          <p className="text-prism-body text-prism-ink">
            Payments open again for new quotes once a different payments admin approves.
          </p>
        )}
        {isFee && (
          <Input
            type="date"
            label="Applies from"
            min={todayPlus(1)}
            value={effective}
            onChange={event => setEffective(event.target.value)}
            helper={`An increase needs a date at least ${FEE_INCREASE_NOTICE_DAYS} days out so creators get notice. A decrease can apply on approval: leave the date empty.`}
          />
        )}
        <Textarea
          label="Reason (Required)"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={event => setReason(event.target.value)}
          helper="The second admin and the change log see this."
        />
        <TwoFactorField value={code} onChange={setCode} />
        {formError && (
          <Notice variant="error" role="alert" title="The change was not sent.">
            <p>{formError}</p>
          </Notice>
        )}
      </div>
    </SidePanel>
  );
}

/* --------------------------------------------------------------------- review */

export function ReviewSheet({
  change,
  viewer,
  open,
  onOpenChange,
}: {
  change: PaymentChange | null;
  viewer: PaymentsViewer | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setChecked(false);
      setCode("");
      setRejecting(false);
      setNote("");
      setFormError(undefined);
    }
  }, [open, change?.id]);

  const done = (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: trpc.admin.payments.pathKey() });
    onOpenChange(false);
  };
  const failed = (error: unknown) => {
    setCode("");
    setFormError(errorMessage(error));
  };

  const approve = useMutation({
    ...trpc.admin.payments.changes.approve.mutationOptions(),
    onSuccess: result =>
      done(
        result?.status === "approved"
          ? "Approved. It applies on the date set."
          : "Approved and applied."
      ),
    onError: failed,
  });
  const reject = useMutation({
    ...trpc.admin.payments.changes.reject.mutationOptions(),
    onSuccess: () => done("Change rejected."),
    onError: failed,
  });

  if (!change) return null;
  const mine = viewer?.userId === change.draftedById;
  const busy = approve.isPending || reject.isPending;

  const codeOk = () => {
    if (/^\d{6}$/.test(code)) return true;
    setFormError("Enter the 6 digit code from your authenticator app.");
    return false;
  };

  const onApprove = () => {
    setFormError(undefined);
    if (!checked) {
      setFormError("Tick the box to confirm you checked the value, the date and the reason.");
      return;
    }
    if (codeOk()) approve.mutate({ id: change.id, code });
  };
  const onReject = () => {
    setFormError(undefined);
    if (note.trim().length < 3) {
      setFormError("Say why, so the drafter knows what to fix.");
      return;
    }
    if (codeOk()) reject.mutate({ id: change.id, note: note.trim(), code });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={next => !busy && onOpenChange(next)}
      eyebrow={mine ? "Your draft" : "Approve change"}
      title={`${change.label} to ${change.newText}`}
      byline={`Drafted by ${who(change.draftedBy, change.draftedById)} on ${formatDayTime(change.createdAt)}`}
      calm
      dismissible={!busy}
      footer={
        <div className="space-y-2">
          {!mine && !rejecting && (
            <Button
              className="h-commit w-full"
              onClick={onApprove}
              disabled={busy}
              aria-busy={approve.isPending || undefined}
            >
              Approve {change.newText}
            </Button>
          )}
          {rejecting ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={onReject}
              disabled={busy}
              aria-busy={reject.isPending || undefined}
            >
              {mine ? "Withdraw draft" : "Reject change"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setRejecting(true)}
              disabled={busy}
            >
              {mine ? "Withdraw this draft" : "Reject with a reason"}
            </Button>
          )}
          <p className="text-prism-meta text-prism-ink-2">
            Your name and the time are saved in the change log.
          </p>
        </div>
      }
    >
      <div className="space-y-5 font-prism">
        <StepBar steps={STEPS} current={1} />
        {mine && (
          <Notice variant="info" title="You drafted this change.">
            <p>A different payments admin approves it. You can withdraw it.</p>
          </Notice>
        )}
        <ReviewSlab
          rows={[
            { label: "From", value: change.oldText },
            { label: "To", value: change.newText },
            {
              label: "Applies from",
              value: change.effectiveAt ? formatDay(change.effectiveAt) : "On approval",
            },
            { label: "Where", value: change.target === "server" ? "Server setting" : "On chain" },
            ...(change.expiresAt
              ? [{ label: "Expires unapproved", value: formatDay(change.expiresAt) }]
              : []),
          ]}
        />
        <section aria-label="Reason given" className="space-y-1">
          <h3 className="text-prism-label font-semibold text-prism-ink">Reason given</h3>
          <p className="text-prism-body text-prism-ink">{change.reason}</p>
        </section>
        {!mine && !rejecting && (
          <Checkbox checked={checked} onCheckedChange={setChecked} required>
            I checked the new value, the date and the reason. (Required)
          </Checkbox>
        )}
        {rejecting && (
          <Textarea
            label={
              mine ? "Why you are withdrawing it (Required)" : "Why you are rejecting it (Required)"
            }
            rows={3}
            maxLength={500}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
        )}
        <TwoFactorField value={code} onChange={setCode} />
        {formError && (
          <Notice variant="error" role="alert" title="Nothing was changed.">
            <p>{formError}</p>
          </Notice>
        )}
      </div>
    </SidePanel>
  );
}
