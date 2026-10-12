import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { trpc } from "@repo/ui";
import {
  DEFAULT_TELEGRAM_MESSAGE_LABEL,
  DM_RULE_LABELS,
  type DmRuleKind,
  type TelegramMessageBlock as TelegramMessageBlockType,
} from "@repo/constants";
import type { ThemeConfig } from "../../types/editor";
import { cn } from "../../utils/cn";
import { getButtonBaseStyle, getButtonEffectStyle } from "../../utils/styles";

/** Creator font size clamped to 16 to 20 (040 I06, I10). */
function clampedFontSize(theme: ThemeConfig | undefined) {
  const raw = parseFloat(String(theme?.fontSize ?? "16"));
  const size = Number.isFinite(raw) ? Math.min(20, Math.max(16, raw)) : 16;
  return `${size}px`;
}

/**
 * The live preview's Message me on Telegram block (Build Board #2, Screen Review
 * 115, board tg4): the creator's button with a send mark and, under it, the rule
 * in one line in the creator's text color. Never an amount (spec 3.11b). Inert,
 * like every preview block (D10). The public renderer lives in
 * apps/landingpage/src/components/blocks/TelegramMessageBlock.tsx.
 */
export function TelegramMessageBlock({
  block,
  theme,
  label,
  ruleKind,
}: {
  block?: TelegramMessageBlockType;
  theme: ThemeConfig | undefined;
  label?: string;
  /** The creator's rule; no hint for Anyone */
  ruleKind?: DmRuleKind | null;
}) {
  const text =
    (label ?? block?.config.label ?? DEFAULT_TELEGRAM_MESSAGE_LABEL).trim() ||
    DEFAULT_TELEGRAM_MESSAGE_LABEL;
  const hint = ruleKind && ruleKind !== "ANYONE" ? DM_RULE_LABELS[ruleKind] : null;
  return (
    <div className="space-y-1.5">
      <span
        role="presentation"
        className={cn(
          "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
          getButtonBaseStyle(theme?.buttonStyle),
          getButtonEffectStyle(theme?.buttonEffect)
        )}
        style={{
          backgroundColor: theme?.buttonColor,
          fontFamily: theme?.fontFamily,
          color: theme?.fontColor,
        }}
      >
        <span aria-hidden className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
          <Send className="h-[21px] w-[21px]" />
        </span>
        <span
          className="line-clamp-2 flex-1 break-words text-center font-semibold"
          style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
        >
          {text}
        </span>
        <span aria-hidden className="w-[21px] shrink-0" />
      </span>
      {hint && (
        <p
          className="text-center text-[13px] leading-4"
          style={{ color: theme?.fontColor, fontFamily: theme?.fontFamily, opacity: 0.8 }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The preview with the creator's live rule. Visitors see the button only while Fan
 * messages are on; until then the preview shows it faded, so the creator can
 * check the theme, and the block row explains why.
 */
export function TelegramMessagePreview({
  block,
  theme,
}: {
  block: TelegramMessageBlockType;
  theme: ThemeConfig | undefined;
}) {
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    staleTime: 30_000,
  });
  const on = !!settings.data?.enabled;
  return (
    <div className={cn(!on && "opacity-60")}>
      <TelegramMessageBlock
        block={block}
        theme={theme}
        ruleKind={on ? (settings.data!.ruleKind as DmRuleKind) : null}
      />
    </div>
  );
}
