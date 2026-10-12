import { useId } from "react";
import {
  DM_RULE_HELPERS,
  DM_RULE_KINDS,
  DM_RULE_LABELS,
  TELEGRAM_APP_STRINGS as S,
  TESTNET_LINE,
} from "@repo/constants";
import { cn } from "@repo/ui";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";

import type { RuleValue } from "./shared";

export type { RuleValue };

/**
 * Who may message the creator (rows 114 and 121, boards tg3 and tg10): five radio
 * tiles in Memberships decision 8 vocabulary. Followers and members is
 * recommended. Members only waits on Memberships; the pool tiles need a pool.
 * The stake tile adds an amount well in tREVO with the testnet line verbatim.
 * The amount stays here: the page, the bot and the Mini App never show it.
 */
export function RuleTiles({
  value,
  onChange,
  hasPool,
  disabled = false,
  stakeError,
}: {
  value: RuleValue;
  onChange: (next: RuleValue) => void;
  hasPool: boolean;
  disabled?: boolean;
  stakeError?: string | null;
}) {
  const name = useId();
  const stakeId = useId();
  return (
    <fieldset className="space-y-[13px]" disabled={disabled}>
      <legend className="sr-only">{S.ruleTitle}</legend>
      {DM_RULE_KINDS.map(kind => {
        const unavailable =
          kind === "PAID_MEMBER" || ((kind === "POOL_MEMBER" || kind === "STAKE_MIN") && !hasPool);
        const note =
          kind === "PAID_MEMBER"
            ? S.paidMembersSoon
            : unavailable
              ? S.needsPoolHint
              : DM_RULE_HELPERS[kind];
        const selected = value.ruleKind === kind;
        return (
          <div
            key={kind}
            className={cn(
              "rounded-prism-13 p-[13px] transition-shadow duration-prism-hover ease-prism",
              selected ? "bg-prism-nav-tint ring-[1.5px] ring-prism-nav" : "prism-well",
              unavailable && "opacity-60"
            )}
          >
            <label
              className={cn(
                "flex min-h-touch items-start gap-3 font-prism",
                unavailable || disabled ? "cursor-default" : "cursor-pointer"
              )}
            >
              <input
                type="radio"
                name={name}
                value={kind}
                checked={selected}
                disabled={unavailable || disabled}
                onChange={() => onChange({ ...value, ruleKind: kind })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-prism-nav"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink">
                  {DM_RULE_LABELS[kind]}
                  {kind === "FOLLOWER" && (
                    <span className="rounded-full bg-prism-nav px-2 py-0.5 text-prism-meta font-semibold text-white">
                      {S.recommended}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-prism-meta text-prism-ink-2">{note}</span>
              </span>
            </label>
            {kind === "STAKE_MIN" && selected && (
              <div className="mt-[13px] space-y-2 pl-8">
                <label htmlFor={stakeId} className="block text-prism-label font-semibold">
                  {S.stakeMinLabel}
                </label>
                <div className={wellClass(!!stakeError)}>
                  <input
                    id={stakeId}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value.stakeMin}
                    onChange={event =>
                      onChange({ ...value, stakeMin: event.target.value.replace(/\D/g, "") })
                    }
                    maxLength={30}
                    aria-invalid={!!stakeError || undefined}
                    aria-describedby={`${stakeId}-testnet`}
                    className="min-w-0 flex-1 bg-transparent text-prism-label tabular-nums text-prism-ink outline-none"
                  />
                  <span className="shrink-0 text-prism-meta font-semibold text-prism-ink-2">
                    {S.stakeMinUnit}
                  </span>
                </div>
                {stakeError && <FieldError id={`${stakeId}-error`}>{stakeError}</FieldError>}
                <p id={`${stakeId}-testnet`} className="text-prism-meta text-prism-ink-2">
                  {TESTNET_LINE}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
