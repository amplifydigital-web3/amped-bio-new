import { useState } from "react";
import type { RnsIdBlock as RnsIdBlockType } from "@repo/constants";
import { DEFAULT_RNSID_CONFIG } from "@repo/constants";
import { RnsIdCard, RnsIdentityDialog } from "@repo/ui";
import type { ThemeConfig } from "../../types/editor";
import { useMyPageIdentity } from "../panels/page/rns/useMyPageIdentity";

/**
 * The live preview's RNS ID block (Build Board #33, Screen Review 112). The
 * same shared card as the public page, fed by rns.getMyPageIdentity, which
 * builds the identity exactly as getHandle does (108 I11), so every
 * configurator change shows what fans will see. The sheet opens read only,
 * as the header chip does in the preview (109 I14).
 */
export function RnsIdBlock({
  block,
  theme,
  displayName,
  avatarUrl,
}: {
  block: RnsIdBlockType;
  theme: ThemeConfig | undefined;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const config = {
    ...DEFAULT_RNSID_CONFIG,
    ...block.config,
    show: { ...DEFAULT_RNSID_CONFIG.show, ...block.config.show },
  };
  const page = useMyPageIdentity();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const identity = page.data?.identity ?? null;
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
        since={page.data?.since ?? null}
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
        rnsUrl={import.meta.env.VITE_RNS_URL}
        readOnly
      />
    </>
  );
}
