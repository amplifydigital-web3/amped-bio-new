import { useState } from "react";
import { ExternalLink, Keyboard, LogOut, RotateCw } from "lucide-react";
import { useLocation } from "react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  cn,
  useAuth,
} from "@repo/ui";
import { WordBadge } from "../kit/WordBadge";
import {
  ADMIN_DESTINATIONS,
  destinationForPath,
  isMacPlatform,
  shortcutLabel,
} from "./destinations";

// Screen Review 087 I02, I03, I22. One G1 navigate top bar, 55 high, holding
// the only page title (Figtree 20/23 700), then Refresh (refetches this
// destination's queries, no reload), Open editor (new tab) and the 44 avatar
// with the account menu.

export const editorUrl = () =>
  import.meta.env.VITE_PANEL_URL || import.meta.env.VITE_LANDINGPAGE_URL;

function usePageTitle() {
  const { pathname } = useLocation();
  const destination = destinationForPath(pathname);
  if (pathname === "/themes/new") return "Themes, New theme";
  return destination?.title ?? "Dashboard";
}

function useRefresh() {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const refresh = () => {
    // Only queries on screen refetch; nothing reloads the page
    void queryClient.invalidateQueries({ refetchType: "active" });
  };
  return { refresh, fetching };
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const mac = isMacPlatform();
  const items = ADMIN_DESTINATIONS.filter(item => item.shortcut);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Hold {mac ? "Command and Option" : "Ctrl and Alt"}, then press the letter.
          </DialogDescription>
        </DialogHeader>
        <dl className="prism-slab divide-y divide-prism-line">
          {items.map(item => (
            <div key={item.id} className="flex min-h-touch items-center justify-between gap-4 px-4">
              <dt className="text-prism-label text-prism-ink">{item.label}</dt>
              <dd className="text-prism-label font-semibold tabular-nums text-prism-ink-2">
                <kbd className="font-prism">{shortcutLabel(item.shortcut!, mac)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function AvatarMenu() {
  const { authUser, signOut } = useAuth();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  if (!authUser) return null;
  const email = authUser.email ?? "";
  const initial = (authUser.handle || email || "A").charAt(0).toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = import.meta.env.VITE_LANDINGPAGE_URL;
    } catch {
      toast.error("Sign out failed", {
        duration: Infinity,
        action: { label: "Retry", onClick: () => void handleSignOut() },
      });
    }
  };

  const disc = (
    <span className="prism-lens-thumb flex h-[34px] w-[34px] items-center justify-center rounded-full !shadow-none">
      <span aria-hidden className="text-prism-label font-bold text-prism-nav-pressed">
        {initial}
      </span>
    </span>
  );

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label="Account menu"
          className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full"
        >
          {disc}
        </MenuTrigger>
        <MenuContent align="end" className="w-[288px] max-w-[288px]">
          <div className="flex items-center gap-3 px-3 py-2">
            {disc}
            <div className="min-w-0 flex-1">
              <p className="truncate text-prism-label font-bold text-prism-ink">{email}</p>
              <WordBadge tone="nav" className="mt-1">
                Admin
              </WordBadge>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem asChild>
            <a href={editorUrl()} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              <span className="flex-1">Open editor</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </MenuItem>
          <MenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard aria-hidden />
            Keyboard shortcuts
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void handleSignOut()}>
            <LogOut aria-hidden />
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

export function AdminTopBar() {
  const title = usePageTitle();
  const { refresh, fetching } = useRefresh();
  const [base, ...rest] = title.split(", ");

  return (
    <header className="prism-glass-nav sticky top-[21px] z-20 hidden h-commit items-center gap-2 rounded-prism-34 pl-[21px] pr-[5px] font-prism md:flex">
      <h1 className="min-w-0 flex-1 truncate text-prism-panel-title text-prism-ink">
        {base}
        {rest.length > 0 && (
          <span className="font-medium text-prism-ink-2">, {rest.join(", ")}</span>
        )}
      </h1>
      <button
        type="button"
        onClick={refresh}
        aria-busy={fetching || undefined}
        className="prism-btn-secondary prism-focus inline-flex h-touch shrink-0 items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
      >
        <RotateCw
          aria-hidden
          className={cn("h-[18px] w-[18px]", fetching && "animate-spin motion-reduce:animate-none")}
        />
        Refresh
      </button>
      <a
        href={editorUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="prism-btn-ghost prism-focus inline-flex h-touch shrink-0 items-center gap-2 rounded-prism-13 px-4 text-prism-label font-semibold"
      >
        Open editor
        <ExternalLink aria-hidden className="h-[18px] w-[18px]" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <AvatarMenu />
    </header>
  );
}

// Mobile: title, Refresh 44 icon button and the avatar (087 board, 094 QA).
export function AdminMobileTopBar() {
  const title = usePageTitle();
  const { refresh, fetching } = useRefresh();
  return (
    <header className="prism-glass-nav sticky top-0 z-20 flex min-h-[calc(55px+env(safe-area-inset-top,0px))] items-center gap-2 rounded-none !border-x-0 !border-t-0 pl-[21px] pr-[13px] pt-[env(safe-area-inset-top,0px)] font-prism md:hidden">
      <h1 className="min-w-0 flex-1 truncate text-prism-panel-title text-prism-ink">{title}</h1>
      <button
        type="button"
        onClick={refresh}
        aria-label="Refresh"
        aria-busy={fetching || undefined}
        className="prism-icon-btn prism-focus shrink-0"
      >
        <RotateCw
          aria-hidden
          className={cn("h-5 w-5", fetching && "animate-spin motion-reduce:animate-none")}
        />
      </button>
      <AvatarMenu />
    </header>
  );
}
