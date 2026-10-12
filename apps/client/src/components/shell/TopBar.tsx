import { useState } from "react";
import { useLocation } from "react-router";
import { Copy, ExternalLink } from "lucide-react";
import { Button, useAuth } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { PANEL_TITLES, SAVE_STATUS_PANELS, WALLET_CHIP_PANELS } from "./destinations";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { HelpMenu } from "./HelpMenu";
import { WalletChip } from "./WalletChip";
import { AccountMenu } from "./AccountMenu";
import { InboxButton } from "./InboxButton";
import { NavItemLink } from "./NavItemLink";
import { BrandMark } from "./BrandMark";
import { copyPageLink, publicPageUrl } from "./pageLink";
import { usePageUnpublished } from "./pageVisibility";
import { PublishFirstHint } from "./PublishFirstHint";
import { PublishPageSheet } from "./PublishPageSheet";

// Tab names shown after the destination title, for example "Design, Themes" (002 I09)
const TAB_TITLES: Record<string, Record<string, string>> = {
  design: { themes: "Themes", style: "Style", motion: "Motion" },
  // Settings is the bare Account title (098 I05)
  account: { settings: "Settings", developers: "Developers" },
  "my-pool": { overview: "Overview", broadcasts: "Broadcasts" },
};

function useTitle() {
  const { activePanel } = useEditor();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get("tab");
  const base = PANEL_TITLES[activePanel];
  const tabTitle = tab ? TAB_TITLES[activePanel]?.[tab] : undefined;
  return tabTitle ? `${base}, ${tabTitle}` : base;
}

// Screen Review 002 (D08). Desktop: the context field top bar, a 55 high G1
// navigate capsule, r34. Title at left as the page h1; at right, in this
// order: save status, View page and Copy page link, Help, wallet chip, avatar.
// QA-008: while the page is unpublished, Publish leads and View page and Copy
// page link are disabled with the reason.
export function TopBar() {
  const { activePanel } = useEditor();
  const { authUser } = useAuth();
  const title = useTitle();
  const handle = authUser?.handle ?? "";
  const unpublished = usePageUnpublished();
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <header className="prism-glass-nav sticky top-[21px] z-20 hidden h-commit items-center gap-2 rounded-prism-34 pl-[21px] pr-[5px] font-prism md:flex">
      <h1
        data-shell-title
        data-prism-vt-name="panel-title"
        tabIndex={-1}
        className="min-w-0 flex-1 truncate text-prism-panel-title text-prism-ink outline-none"
      >
        {title}
      </h1>
      {SAVE_STATUS_PANELS.includes(activePanel) && <SaveStatusIndicator />}
      {handle && unpublished && (
        <>
          <Button className="shrink-0" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
          <PublishFirstHint label="View page">
            <Button variant="secondary" disabled tabIndex={-1} className="rounded-prism-13">
              View page
              <ExternalLink aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.5} />
            </Button>
          </PublishFirstHint>
          <PublishFirstHint label="Copy page link">
            <button
              type="button"
              disabled
              tabIndex={-1}
              aria-label="Copy page link"
              className="prism-icon-btn disabled:opacity-50"
            >
              <Copy aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
            </button>
          </PublishFirstHint>
          <PublishPageSheet open={publishOpen} onOpenChange={setPublishOpen} />
        </>
      )}
      {handle && !unpublished && (
        <>
          <a
            href={publicPageUrl(handle)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View your page (opens in a new tab)"
            className="prism-btn-secondary prism-focus inline-flex h-touch shrink-0 items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
          >
            View page
            <ExternalLink aria-hidden className="h-[21px] w-[21px]" strokeWidth={1.5} />
          </a>
          <button
            type="button"
            aria-label="Copy page link"
            onClick={() => void copyPageLink(handle)}
            className="prism-icon-btn prism-focus shrink-0"
          >
            <Copy aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
          </button>
        </>
      )}
      <InboxButton />
      <HelpMenu />
      {WALLET_CHIP_PANELS.includes(activePanel) && <WalletChip />}
      <AccountMenu />
    </header>
  );
}

// Screen Review 003 I05 (D09). Mobile: one compact top bar, full width, 55
// high plus the safe area: title, save status, avatar. View page and Copy page
// link move into the avatar menu. QA-008: Publish sits before the avatar
// while the page is unpublished.
export function MobileTopBar() {
  const { activePanel } = useEditor();
  const title = useTitle();
  const unpublished = usePageUnpublished();
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <header className="prism-glass-nav sticky top-0 z-20 flex min-h-[calc(55px+env(safe-area-inset-top,0px))] items-center gap-2 rounded-none !border-x-0 !border-t-0 pl-[13px] pr-[13px] pt-[env(safe-area-inset-top,0px)] font-prism md:hidden">
      {/* QA-040: the Amplify mark leads the mobile bar as a Home link (44 target) */}
      <NavItemLink
        panel="home"
        current={false}
        className="flex h-11 shrink-0 items-center rounded-prism-13 px-1"
      >
        <BrandMark className="h-[22px] w-auto" />
        <span className="sr-only">Amped.Bio home</span>
      </NavItemLink>
      <h1
        data-shell-title
        data-prism-vt-name="panel-title"
        tabIndex={-1}
        className="min-w-0 flex-1 truncate text-prism-panel-title text-prism-ink outline-none"
      >
        {title}
      </h1>
      {SAVE_STATUS_PANELS.includes(activePanel) && <SaveStatusIndicator compact />}
      {unpublished && (
        <>
          <Button size="sm" className="shrink-0" onClick={() => setPublishOpen(true)}>
            Publish
          </Button>
          <PublishPageSheet open={publishOpen} onOpenChange={setPublishOpen} />
        </>
      )}
      <InboxButton />
      <AccountMenu mobile />
    </header>
  );
}
