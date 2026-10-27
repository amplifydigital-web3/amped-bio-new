"use client";

import { useState } from "react";
import type { RnsIdBlock as RnsIdBlockType, ThemeConfig } from "@repo/constants";
import { DEFAULT_RNSID_CONFIG } from "@repo/constants";
import { RnsIdCard, RnsIdentityDialog, type RnsIdentity } from "@repo/ui";

/**
 * RNS ID block on the public page (Build Board #33, Screen Review 112). The
 * shared card fed by `profile.identity`, which getHandle already filtered by
 * the binding rule, the owner's Page > RNS switches and the block's Name on
 * ID switch. No identity on the page (unbound, expired, hidden) renders
 * nothing (112 D4, D5). Tap opens the same identity sheet as the header chip
 * (112 D3) or the inline facts.
 */
export function RnsIdBlock({
  block,
  theme,
  identity,
  displayName,
  avatarUrl,
  since,
  sendHref,
  rnsUrl,
}: {
  block: RnsIdBlockType;
  theme: ThemeConfig | undefined;
  identity: RnsIdentity;
  displayName: string;
  avatarUrl?: string | null;
  since?: string | null;
  sendHref?: string | null;
  rnsUrl?: string | null;
}) {
  const config = {
    ...DEFAULT_RNSID_CONFIG,
    ...block.config,
    show: { ...DEFAULT_RNSID_CONFIG.show, ...block.config.show },
  };
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!identity) return null;

  const onTap =
    config.tap === "sheet"
      ? () => setOpen(true)
      : config.tap === "inline"
        ? () => setExpanded(current => !current)
        : undefined;

  return (
    <>
      <RnsIdCard
        config={config}
        theme={theme}
        identity={identity}
        displayName={displayName}
        avatarUrl={avatarUrl}
        since={since}
        expanded={expanded}
        onTap={onTap}
        onOpenSheet={() => setOpen(true)}
      />
      <RnsIdentityDialog
        identity={identity}
        open={open}
        onOpenChange={setOpen}
        displayName={displayName}
        avatarUrl={avatarUrl}
        sendHref={sendHref}
        rnsUrl={rnsUrl}
      />
    </>
  );
}
