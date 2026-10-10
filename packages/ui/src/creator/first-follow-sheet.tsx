"use client";

import { useState } from "react";
import { Eye, EyeOff, UserPlus, UsersRound } from "lucide-react";
import { Button } from "../button";
import { BottomSheet, BottomSheetContent } from "../prism/bottom-sheet";
import { Checkbox } from "../prism/flow";

/**
 * Fan Graph (#22) board fg3, decision 3: the first follow ever opens this
 * sheet. Three facts, two unticked boxes, Follow. Later follows are one tap.
 * One component for the public page capsule and the Explore person cards, so
 * the disclosure reads the same wherever the first follow happens.
 */
export function FirstFollowSheet({
  open,
  onOpenChange,
  creatorName,
  showCount,
  busy,
  privacyHref,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorName: string;
  showCount: boolean;
  busy: boolean;
  /** The Privacy Policy on the public site */
  privacyHref: string;
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
      value: showCount ? "The follower count" : "Only the creator sees it",
    },
  ];
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={`Follow ${creatorName}`}>
        <div className="flex flex-col gap-4 pb-2">
          {/* Rows stagger in, 55 ms apart (#26) */}
          <div className="prism-slab prism-stagger overflow-hidden rounded-prism-21">
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
              <a href={privacyHref}>Privacy Policy</a>
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
