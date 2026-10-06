"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "../utils";
import { Button, type ButtonProps } from "../button";
import { sanitizeAmount } from "@repo/constants";

// Prism money flow pieces (spec sections 7, 10 and 15; app structure "money
// flows"; D23 step labels). Every flow that moves value (stake, unstake, send,
// fund, create pool, claim, RNS, conversion, admin processing) is built from
// these parts inside one SidePanel. PR 4 composes them into the shared flow.

/* -------------------------------------------------------------------------- */
/* SidePanel                                                                   */
/* -------------------------------------------------------------------------- */

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Eyebrow above the title, for example "Stake in"
  eyebrow: string;
  // Usually the pool or item name; a node for loading bars with an sr-only name
  title: React.ReactNode;
  byline?: React.ReactNode;
  // 55 art tile: an image or any node (pool art, token icon)
  art?: React.ReactNode;
  // Commit state (Review and Confirm): calmer panel, no rim, no halo
  calm?: boolean;
  children: React.ReactNode;
  // Sticky area at the bottom (primary action, wallet note)
  footer?: React.ReactNode;
  // Header buttons before Close, for example a More actions menu (44 icon buttons)
  headerActions?: React.ReactNode;
  // False while a wallet signature is pending: Close is disabled and Escape and
  // outside clicks do nothing (section 15, close blocked while signing)
  dismissible?: boolean;
  className?: string;
}

// The G3 value panel as a side sheet. Desktop: 508 wide, 21 from the right,
// top and bottom edges of the viewport. Mobile: full screen. Focus is trapped,
// Escape closes, focus returns to the trigger.
export function SidePanel({
  open,
  onOpenChange,
  eyebrow,
  title,
  byline,
  art,
  calm = false,
  children,
  footer,
  headerActions,
  dismissible = true,
  className,
}: SidePanelProps) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };
  // Escape closes the top layer only. @radix-ui/react-dialog and
  // @radix-ui/react-dropdown-menu resolve to different copies of
  // react-dismissable-layer (1.1.10 and 1.1.7), so they keep separate layer
  // stacks and both react to one Escape. While a menu, select or popover
  // opened from the panel is showing, Escape is left to it (QA-012).
  const onEscape = (event: KeyboardEvent) => {
    block(event);
    if (document.querySelector("[data-radix-popper-content-wrapper]")) event.preventDefault();
  };
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={next => {
        if (next || dismissible) onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="prism-scrim fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        {/* The halo sits behind the panel as a sibling (section 6), so it
            glows around the panel instead of through it. */}
        {open && !calm && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-y-[21px] right-[21px] z-50 hidden w-[508px] rounded-prism-34 sm:block"
          >
            <span className="prism-halo-panel" />
          </div>
        )}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Focus the panel itself on open so no control shows a focus ring
          // before the person uses the keyboard; Tab then starts in the header.
          onOpenAutoFocus={event => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onEscapeKeyDown={onEscape}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            calm ? "prism-value-panel-calm" : "prism-value-panel",
            "fixed z-50 flex flex-col font-prism text-prism-ink outline-none",
            "inset-0 rounded-none sm:inset-y-[21px] sm:left-auto sm:right-[21px] sm:w-[508px] sm:rounded-prism-34",
            "duration-prism-panel ease-prism data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 sm:data-[state=open]:slide-in-from-right-8 sm:data-[state=closed]:slide-out-to-right-8 motion-reduce:animate-none",
            className
          )}
        >
          {!calm && <span aria-hidden className="prism-rim max-sm:hidden" />}
          <header className="flex items-start gap-3 px-5 pb-5 pt-5 sm:px-8 sm:pt-8">
            {art && (
              <div className="h-commit w-commit shrink-0 overflow-hidden rounded-prism-13 bg-white/60">
                {art}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
                <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
                {eyebrow}
              </p>
              <DialogPrimitive.Title className="mt-1 line-clamp-2 break-words text-prism-panel-title">
                {title}
              </DialogPrimitive.Title>
              {byline && <div className="mt-1 text-prism-meta text-prism-ink-2">{byline}</div>}
            </div>
            {headerActions}
            <DialogPrimitive.Close
              disabled={!dismissible}
              className="prism-icon-btn prism-focus prism-btn-disabled shrink-0"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5 sm:px-8">{children}</div>
          {footer && (
            <footer className="space-y-3 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-3 sm:px-8 sm:pb-8">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* StepBar                                                                     */
/* -------------------------------------------------------------------------- */

// Section 10: columns with 3px bars. Current is indigo with a glow and a 700
// label; done is success with a check and a hidden ", done"; next is line.
// D23 labels: step 1 names what the person sets (Amount, Name, Recipient,
// Connect), then Review, then Confirm in wallet.
export function StepBar({
  steps,
  current,
  className,
}: {
  steps: string[];
  // Zero based index of the current step
  current: number;
  className?: string;
}) {
  return (
    <ol
      className={cn("grid gap-3 font-prism", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className="space-y-2"
          >
            <span
              aria-hidden
              className={cn(
                "block h-[3px] rounded-full",
                state === "done" && "bg-prism-success",
                state === "current" && "bg-prism-nav shadow-[0_0_8px_rgba(86,80,162,0.45)]",
                state === "next" && "bg-prism-line-strong"
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 text-prism-meta",
                state === "done" && "font-semibold text-prism-success",
                state === "current" && "font-bold text-prism-nav-pressed",
                state === "next" && "font-medium text-prism-ink-2"
              )}
            >
              {state === "done" && <Check className="h-3.5 w-3.5" aria-hidden />}
              {label}
              {state === "done" && <span className="sr-only">, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* AmountWell                                                                  */
/* -------------------------------------------------------------------------- */

export interface AmountWellProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  unit: string;
  // Right side of the label row, for example "Available 1,204.5 tREVO"
  available?: React.ReactNode;
  // Line under the well, for example "Balance after 954.5 tREVO"
  balanceAfter?: React.ReactNode;
  error?: string;
  // Commit state: no cyan light, no focus ring, read only, Edit amount lens
  calm?: boolean;
  onEdit?: () => void;
  id?: string;
}

// Section 7 amount well: 131 high, r21, create light, Bebas amount, 44 unit
// pill. Calm (commit) state: no color light, 1px line ring, "You stake" style
// label and an Edit amount lens.
export function AmountWell({
  label,
  value,
  onChange,
  unit,
  available,
  balanceAfter,
  error,
  calm = false,
  onEdit,
  id,
}: AmountWellProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;

  return (
    <div className="space-y-2 font-prism">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-prism-label font-bold text-prism-ink">
          {label}
        </label>
        {available && !calm && (
          <span className="text-prism-meta tabular-nums text-prism-ink-2">{available}</span>
        )}
      </div>
      <div
        className={cn(
          "relative flex h-[131px] items-center gap-3 rounded-prism-21 pl-5 pr-3",
          calm
            ? "bg-white/80 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]"
            : "bg-[radial-gradient(260px_110px_at_16%_0%,rgba(39,170,225,0.18),transparent_70%),radial-gradient(300px_80px_at_50%_100%,#FFF,transparent_80%),linear-gradient(180deg,#F6F3FB_0%,#FFFFFF_60%)] shadow-[inset_0_5px_13px_rgba(60,24,80,0.14),inset_0_1px_2px_rgba(60,24,80,0.12),inset_0_0_0_1.5px_#0B5A80,0_0_0_4px_rgba(39,170,225,0.32),0_0_21px_rgba(39,170,225,0.25),0_2px_0_rgba(255,255,255,0.9)]",
          error && !calm && "shadow-[inset_0_0_0_1.5px_#B3261E,0_0_0_4px_rgba(179,38,30,0.16)]"
        )}
      >
        <input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          readOnly={calm}
          value={value}
          placeholder="0"
          onChange={event => onChange?.(sanitizeAmount(event.target.value, value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || balanceAfter ? noteId : undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent font-prism-display tabular-nums text-prism-ink placeholder:text-prism-ink-3/50 focus:outline-none",
            "text-[68px] leading-[68px] tracking-[0.01em] sm:text-prism-amount",
            calm && "cursor-default sm:text-[88px] sm:leading-[88px]"
          )}
        />
        <span
          className={cn(
            "inline-flex h-touch shrink-0 items-center rounded-full bg-white px-4 text-prism-label font-bold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]",
            // Edit amount sits top right in the commit state; the unit drops below it
            calm && onEdit && "mb-3 self-end"
          )}
        >
          {unit}
        </span>
        {calm && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="prism-btn-ghost prism-focus absolute right-3 top-3 inline-flex h-touch items-center gap-1.5 rounded-prism-13 px-3 text-prism-meta font-semibold"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit amount
          </button>
        )}
      </div>
      {(error || balanceAfter) && (
        <p
          id={noteId}
          className={cn(
            "text-prism-meta tabular-nums",
            error ? "font-semibold text-prism-danger" : "text-prism-ink-2"
          )}
        >
          {error ?? balanceAfter}
        </p>
      )}
    </div>
  );
}

// Section 8 preset chips for the amount well: flex, 44 high, pill.
export function AmountPresets({
  presets,
  onPick,
  label = "Quick amounts",
}: {
  presets: { label: string; value: string }[];
  onPick: (value: string) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {presets.map(preset => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onPick(preset.value)}
          className="prism-focus h-touch flex-1 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.66))] font-prism text-prism-label font-semibold tabular-nums text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)] transition-shadow duration-prism-hover ease-prism hover:shadow-[inset_0_0_0_1px_rgba(22,21,43,0.28),3px_6px_13px_rgba(48,47,93,0.12)]"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ReviewSlab and commit                                                       */
/* -------------------------------------------------------------------------- */

// Section 10 review: G2 slab, rows 44 high, every figure tabular, the exact
// amount entered. Callers supply the rows (You stake, Pool, Network fee,
// Balance after, Pool total after, Unstaking).
export function ReviewSlab({
  rows,
  className,
}: {
  rows: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("prism-slab divide-y divide-prism-line font-prism", className)}>
      {rows.map(row => (
        <div
          key={row.label}
          className="flex min-h-touch items-center justify-between gap-4 px-4 py-2"
        >
          <dt className="text-prism-label text-prism-ink-2">{row.label}</dt>
          <dd className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Section 8 checkbox: 24 box r5; checked is value deep with a white check.
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  id,
  required,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  id?: string;
  required?: boolean;
}) {
  const autoId = React.useId();
  const boxId = id ?? autoId;
  return (
    <label
      htmlFor={boxId}
      className="flex min-h-touch cursor-pointer items-start gap-3 py-2 font-prism"
    >
      <span className="relative mt-px inline-flex h-6 w-6 shrink-0">
        <input
          id={boxId}
          type="checkbox"
          checked={checked}
          required={required}
          onChange={event => onCheckedChange(event.target.checked)}
          className="prism-focus peer h-6 w-6 cursor-pointer appearance-none rounded-prism-5 border-[1.5px] border-[rgba(22,21,43,0.4)] bg-white checked:border-prism-value-deep checked:bg-prism-value-deep"
        />
        <Check
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto hidden h-4 w-4 text-white peer-checked:block"
          strokeWidth={3}
        />
      </span>
      <span className="text-prism-body text-prism-ink">{children}</span>
    </label>
  );
}

// Verbatim line under every commit button (section 8). The wallet step for
// embedded wallets is still an open wording decision (Screen Review 090 to
// 092), so flows can pass their own approved line.
export const WALLET_NOTE = "You confirm in your wallet next. Nothing moves until you sign.";

// The commit action: value deep button labeled with the verb and amount (for
// example "Stake 250 tREVO"), followed by the wallet note.
export function CommitAction({
  children,
  note = WALLET_NOTE,
  ...props
}: ButtonProps & { note?: string }) {
  return (
    <div className="space-y-2">
      <Button variant="commit" size="lg" className="w-full" {...props}>
        {children}
      </Button>
      <p className="text-center font-prism text-prism-meta text-prism-ink-2">{note}</p>
    </div>
  );
}
