import { useEffect, useState } from "react";
import { Copy, ExternalLink, HelpCircle, LogOut, Settings } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  cn,
  useAuth,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { useShellNavigation } from "./ShellNavigation";
import { HelpMenuItems } from "./HelpMenu";
import { copyPageLink, publicPageUrl } from "./pageLink";
import { PUBLISH_FIRST, usePageUnpublished } from "./pageVisibility";

// Screen Review 002 I05, I06 and D17. The avatar button (44 circle, 34 photo,
// initial on a lens disc as the fallback) opens the account menu: identity
// header, Account settings, View my page, Help, Sign out. On mobile View page
// and Copy page link are its first rows (003 I05). While the page is
// unpublished (QA-008) those rows are disabled and name the reason.
export function AccountMenu({ mobile = false }: { mobile?: boolean }) {
  const { authUser, signOut } = useAuth();
  const unpublished = usePageUnpublished();
  const { profile, setDefault, activePanel } = useEditor();
  // 098 I04: on Account no rail item is current; the avatar ring is the cue
  const onAccount = activePanel === "account";
  const { go } = useShellNavigation();
  const [imageError, setImageError] = useState(false);

  useEffect(() => setImageError(false), [authUser?.image]);

  if (!authUser) return null;
  const handle = authUser.handle;
  const name = profile.name || handle;
  const initial = (handle || "?").charAt(0).toUpperCase();
  const photo = authUser.image && !imageError ? authUser.image : null;

  const avatar = (size: "trigger" | "header") => (
    <span
      className={
        size === "trigger"
          ? "flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full prism-lens-thumb !shadow-none"
          : "flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full prism-lens-thumb !shadow-none"
      }
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span aria-hidden className="text-prism-label font-bold text-prism-nav-pressed">
          {initial}
        </span>
      )}
    </span>
  );

  const handleSignOut = async () => {
    try {
      await signOut();
      setDefault();
      window.location.href = import.meta.env.VITE_LANDINGPAGE_URL;
    } catch {
      // I11: stay in the editor and offer Retry
      toast.add({
        type: "error",
        title: "Sign out failed",
        actionProps: { children: "Retry", onClick: () => void handleSignOut() },
      });
    }
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={onAccount ? "Account menu, current location Account" : "Account menu"}
        className={cn(
          "prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full",
          onAccount && "ring-2 ring-prism-nav"
        )}
      >
        {avatar("trigger")}
      </MenuTrigger>
      <MenuContent align="end" className="w-[288px] max-w-[288px]">
        <div className="flex items-center gap-3 px-3 py-2">
          {avatar("header")}
          <div className="min-w-0">
            <p className="truncate text-prism-label font-bold text-prism-ink">{name}</p>
            <p className="truncate text-prism-meta text-prism-ink-2">@{handle}</p>
          </div>
        </div>
        <MenuSeparator />
        {unpublished && (
          <>
            <MenuItem disabled aria-describedby="account-menu-publish-first">
              <ExternalLink aria-hidden />
              View my page
            </MenuItem>
            {mobile && (
              <MenuItem disabled aria-describedby="account-menu-publish-first">
                <Copy aria-hidden />
                Copy page link
              </MenuItem>
            )}
            <p
              id="account-menu-publish-first"
              className="px-3 pb-2 text-prism-meta text-prism-ink-2"
            >
              {PUBLISH_FIRST}
            </p>
          </>
        )}
        {mobile && !unpublished && (
          <>
            <MenuItem asChild>
              <a href={publicPageUrl(handle)} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                <span className="flex-1">View my page</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </MenuItem>
            <MenuItem onSelect={() => void copyPageLink(handle)}>
              <Copy aria-hidden />
              Copy page link
            </MenuItem>
          </>
        )}
        <MenuItem onSelect={() => go("account")}>
          <Settings aria-hidden />
          Account settings
        </MenuItem>
        {!mobile && !unpublished && (
          <MenuItem asChild>
            <a href={publicPageUrl(handle)} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              <span className="flex-1">View my page</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </MenuItem>
        )}
        <MenuSub>
          <MenuSubTrigger>
            <HelpCircle aria-hidden />
            Help
          </MenuSubTrigger>
          <MenuSubContent className="w-[288px]">
            <HelpMenuItems />
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        <MenuItem onSelect={() => void handleSignOut()}>
          <LogOut aria-hidden />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
