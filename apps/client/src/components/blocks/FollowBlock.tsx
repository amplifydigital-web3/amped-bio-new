import { UserPlus } from "lucide-react";
import type { FollowBlock as FollowBlockType } from "@repo/constants";
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
 * The live preview's Follow block (Build Board #30, spec 3.4 and 3.7). The
 * same anatomy as the public button in the creator's theme, inert: the
 * preview is the creator looking at their own page (D10). The public
 * renderer lives in apps/landingpage/src/components/blocks/FollowBlock.tsx.
 */
export function FollowBlock({
  block,
  theme,
  label,
}: {
  block?: FollowBlockType;
  theme: ThemeConfig | undefined;
  label?: string;
}) {
  const text = (label ?? block?.config.label ?? "Follow").trim() || "Follow";
  return (
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
        <UserPlus className="h-[21px] w-[21px]" />
      </span>
      <span
        className="line-clamp-2 flex-1 break-words text-center font-semibold"
        style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
      >
        {text}
      </span>
      <span aria-hidden className="w-[21px] shrink-0" />
    </span>
  );
}
