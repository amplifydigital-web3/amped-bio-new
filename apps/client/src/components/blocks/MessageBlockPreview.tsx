import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { DEFAULT_MESSAGE_BLOCK_LABEL, MESSAGE_RULE_LABELS } from "@repo/constants";
import { trpc } from "@repo/ui";
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
 * The live preview's Message me block (Amped Messages M6, board m6): the creator's
 * button with a message mark and the rule in one line under it, never an amount. Faded
 * while visitors do not see it (No one, or paused). Inert, like every preview block. The
 * public renderer is apps/landingpage/src/components/blocks/MessageBlock.tsx.
 */
export function MessageBlockPreview({
  label,
  theme,
}: {
  label?: string;
  theme: ThemeConfig | undefined;
}) {
  const settings = useQuery({ ...trpc.messages.settings.get.queryOptions(), staleTime: 30_000 });
  const rule = settings.data?.ruleKind;
  const closed = !settings.data || rule === "NOBODY" || settings.data.paused;
  const hint = rule && rule !== "ANYONE" && rule !== "NOBODY" ? MESSAGE_RULE_LABELS[rule] : null;
  const text = label?.trim() || DEFAULT_MESSAGE_BLOCK_LABEL;
  return (
    <div className={cn("space-y-1.5", closed && "opacity-60")}>
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
        <MessageCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
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
