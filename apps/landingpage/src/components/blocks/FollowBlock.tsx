"use client";

import { ChevronDown, UserCheck, UserMinus, UserPlus } from "lucide-react";
import type { FollowBlock as FollowBlockType, ThemeConfig } from "@repo/constants";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  cn,
} from "@repo/ui";
import { getButtonBaseStyle, getButtonEffectStyle } from "@/lib/styles";
import { CREATOR_FOCUS, CreatorButton, clampedFontSize } from "./frame";
import { useFollowContext } from "@/components/follow/FollowContext";

/**
 * Follow block (Build Board #30, spec 3.4, boards fb1 and fb6). A creator
 * styled Follow button in the page flow with the same anatomy as every
 * creator button. It runs the capsule's flows: the fan sign up card when
 * signed out, the first-follow sheet once, a toast with Undo after that.
 * Following opens the same menu as the capsule. The owner sees the button
 * disabled, so they can check the theme; the server refuses a self follow
 * anyway.
 */
export function FollowBlock({
  block,
  theme,
  label,
}: {
  block?: FollowBlockType;
  theme: ThemeConfig | undefined;
  /** Overrides the block label (the Followers card passes its own) */
  label?: string;
}) {
  const follow = useFollowContext();
  const text = (label ?? block?.config.label ?? "Follow").trim() || "Follow";

  // The fan graph is off, or the page is the viewer's own: a quiet button
  if (!follow || !follow.enabled || follow.isOwner) {
    return (
      <span
        role="presentation"
        aria-disabled
        className={cn(
          "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2 opacity-70",
          getButtonBaseStyle(theme?.buttonStyle)
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

  const { state } = follow;
  const status = state.status;
  const viewer = status?.viewer;

  if (!viewer?.following) {
    return (
      <CreatorButton
        theme={theme}
        icon={<UserPlus className="h-[21px] w-[21px]" />}
        label={text}
        onClick={() => {
          if (state.busy) return;
          if (!status && state.failed) {
            void state.retry();
            return;
          }
          state.startFollow("block");
        }}
      />
    );
  }

  // Following: the same menu the capsule opens (fg8), in the creator's button
  const name = status?.creatorName ?? "this creator";
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          disabled={state.busy}
          aria-busy={state.busy || undefined}
          className={cn(
            "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
            getButtonBaseStyle(theme?.buttonStyle),
            getButtonEffectStyle(theme?.buttonEffect),
            CREATOR_FOCUS
          )}
          style={{
            backgroundColor: theme?.buttonColor,
            fontFamily: theme?.fontFamily,
            color: theme?.fontColor,
          }}
        >
          <span aria-hidden className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
            {viewer.pending ? (
              <span className="h-2 w-2 rounded-full bg-current opacity-70" />
            ) : (
              <UserCheck className="h-[21px] w-[21px]" />
            )}
          </span>
          <span
            className="line-clamp-2 flex-1 break-words text-center font-semibold"
            style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
          >
            Following
            {viewer.pending && (
              <span className="sr-only">, waiting for your email confirmation</span>
            )}
          </span>
          <span aria-hidden className="flex w-[21px] shrink-0 items-center justify-center">
            <ChevronDown className="h-[21px] w-[21px]" />
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="center" side="top" className="w-[280px]">
        <MenuCheckboxItem
          checked={viewer.showPublicly}
          onCheckedChange={checked => void state.update({ showPublicly: checked === true })}
          onSelect={event => event.preventDefault()}
        >
          Show me on {name}&apos;s public list
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={viewer.emailUpdates}
          onCheckedChange={checked => void state.update({ emailUpdates: checked === true })}
          onSelect={event => event.preventDefault()}
        >
          Email me {name}&apos;s updates
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void state.unfollow()}>
          <UserMinus aria-hidden />
          Unfollow
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
