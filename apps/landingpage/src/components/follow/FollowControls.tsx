"use client";

import { useState } from "react";
import {
  ChevronDown,
  EyeOff,
  Eye,
  RotateCw,
  UserCheck,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  Checkbox,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  ToastCard,
  cn,
} from "@repo/ui";
import type { FollowStatus, FollowToast } from "./useFollow";

const numberFormat = new Intl.NumberFormat("en-US");

/** 13/16 count line in the capsule. Under 10 reads New on Amped (decision 9). */
export function FollowerCount({ status }: { status: FollowStatus | null }) {
  if (!status || !status.showCount) return null;
  return (
    <span className="whitespace-nowrap px-2 text-[13px] font-semibold leading-[16px] text-prism-ink tabular-nums">
      {status.newOnAmped ? (
        "New on Amped"
      ) : (
        <>
          <b className="font-bold">{numberFormat.format(status.followerCount ?? 0)}</b> followers
        </>
      )}
    </span>
  );
}

/**
 * QA-032: the follow status did not load (network or server error). Follow
 * shows disabled with a Try again, instead of vanishing from the capsule.
 */
export function FollowRetry({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <>
      <Button disabled className="flex-1 sm:flex-none" aria-describedby="follow-retry-note">
        <UserPlus aria-hidden />
        Follow
      </Button>
      <Button
        variant="secondary"
        onClick={onRetry}
        disabled={busy}
        aria-busy={busy || undefined}
        className="flex-1 sm:flex-none"
      >
        <RotateCw aria-hidden />
        Try again
      </Button>
      <span id="follow-retry-note" className="sr-only">
        Follow did not load.
      </span>
    </>
  );
}

/**
 * Follow (primary, the capsule's one primary) or Following (secondary, opens
 * the menu). Boards fg1, fg2, fg8, fg9.
 */
export function FollowButton({
  status,
  busy,
  onFollow,
  onUnfollow,
  onUpdate,
}: {
  status: FollowStatus | null;
  busy: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onUpdate: (patch: { showPublicly?: boolean; emailUpdates?: boolean }) => void;
}) {
  if (!status || status.isOwner) return null;
  const viewer = status.viewer;
  const name = status.creatorName;

  if (!viewer?.following) {
    return (
      <Button
        onClick={onFollow}
        disabled={busy}
        aria-busy={busy || undefined}
        className="flex-1 sm:flex-none"
      >
        <UserPlus aria-hidden />
        Follow
      </Button>
    );
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" className="flex-1 sm:flex-none" disabled={busy}>
          {viewer.pending ? (
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-prism-warning-ink" />
          ) : (
            <UserCheck aria-hidden className="!text-prism-success" />
          )}
          Following
          {viewer.pending && <span className="sr-only">, waiting for your email confirmation</span>}
          <ChevronDown aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-[280px]">
        <MenuCheckboxItem
          checked={viewer.showPublicly}
          onCheckedChange={checked => onUpdate({ showPublicly: checked === true })}
          onSelect={event => event.preventDefault()}
        >
          Show me on {name}&apos;s public list
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={viewer.emailUpdates}
          onCheckedChange={checked => onUpdate({ emailUpdates: checked === true })}
          onSelect={event => event.preventDefault()}
        >
          Email me {name}&apos;s updates
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuItem onSelect={onUnfollow}>
          <UserMinus aria-hidden />
          Unfollow
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * First follow only (board fg3, decision 3). Three facts, two unticked boxes,
 * Follow. Later follows are one tap.
 */
export function FirstFollowSheet({
  open,
  onOpenChange,
  creatorName,
  showCount,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorName: string;
  showCount: boolean;
  busy: boolean;
  onConfirm: (choice: { showPublicly: boolean; emailUpdates: boolean }) => void;
}) {
  const [showPublicly, setShowPublicly] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const rows = [
    { icon: Eye, label: `${creatorName} sees`, value: "Your name, @handle and photo" },
    { icon: EyeOff, label: "Stays private", value: "Your email" },
    {
      icon: UsersRound,
      label: "Everyone sees",
      value: showCount
        ? "The follower count"
        : "Only the creator sees it",
    },
  ];
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={`Follow ${creatorName}`}>
        <div className="flex flex-col gap-4 pb-2">
          <div className="prism-slab overflow-hidden rounded-prism-21">
            {rows.map(row => (
              <div
                key={row.label}
                className="flex min-h-touch flex-col items-start justify-center gap-0.5 border-b border-prism-line px-4 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex items-center gap-2 whitespace-nowrap text-prism-body text-prism-ink-2">
                  <row.icon aria-hidden className="h-[18px] w-[18px]" />
                  {row.label}
                </span>
                <span className="pl-[26px] text-prism-label font-semibold text-prism-ink sm:pl-0 sm:text-right">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div>
            <Checkbox checked={showPublicly} onCheckedChange={setShowPublicly}>
              Show me on {creatorName}&apos;s public follower list
              <span className="mt-1 block text-prism-meta text-prism-ink-2">
                Off unless you turn it on.
              </span>
            </Checkbox>
            <Checkbox checked={emailUpdates} onCheckedChange={setEmailUpdates}>
              Email me {creatorName}&apos;s updates
              <span className="mt-1 block text-prism-meta text-prism-ink-2">
                Unsubscribe from any email. Updates always reach your Inbox.
              </span>
            </Checkbox>
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => onConfirm({ showPublicly, emailUpdates })}
          >
            <UserPlus aria-hidden />
            Follow {creatorName}
          </Button>
          <div className="flex items-center justify-between gap-3">
            <span className="text-prism-meta text-prism-ink-2">Free. Unfollow any time.</span>
            <Button variant="ghost" asChild>
              <a href="/privacy">Privacy Policy</a>
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/** The capsule's toast: one at a time, above the capsule, Undo when it applies. */
export function FollowToastView({
  toast,
  onDismiss,
}: {
  toast: FollowToast | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div className={cn("pointer-events-auto w-full max-w-[420px]")} aria-live="polite">
      <ToastCard
        key={toast.id}
        type={toast.type}
        title={toast.text}
        action={
          toast.undo
            ? {
                label: "Undo",
                onClick: () => {
                  toast.undo?.();
                  onDismiss();
                },
              }
            : undefined
        }
        onDismiss={onDismiss}
      />
    </div>
  );
}
