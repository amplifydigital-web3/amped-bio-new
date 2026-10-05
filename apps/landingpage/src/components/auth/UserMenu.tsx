"use client";

import Link from "next/link";
import { ExternalLink, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { getPanelHomeUrl } from "@/lib/panel";

// Header right (Screen Review 007 I05). Signed out: one Sign in secondary lens.
// Signed in: Open editor (desktop) and a 44 avatar button opening the account
// menu (header row, Open editor, View my page, Sign out). The session hook
// refetches on focus and syncs across tabs, so a sign in elsewhere shows here
// without a reload.
export function UserMenu() {
  const { data: session } = authClient.useSession();
  const user = session?.user as
    | { name?: string | null; image?: string | null; handle?: string | null }
    | undefined;

  const signOut = async () => {
    try {
      await authClient.signOut();
    } finally {
      // Force a fresh session read so the page reflects the signed out state
      window.location.href = "/";
    }
  };

  if (!user) {
    return (
      <Button variant="secondary" asChild className="whitespace-nowrap">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  const handle = user.handle || "";

  return (
    <>
      <Button variant="secondary" asChild className="hidden sm:inline-flex">
        <a href={getPanelHomeUrl()}>Open editor</a>
      </Button>
      <Menu>
        <MenuTrigger
          aria-label="Account menu"
          className="prism-icon-btn prism-focus overflow-hidden"
        >
          {user.image ? (
            <img src={user.image} alt="" className="h-[34px] w-[34px] rounded-full object-cover" />
          ) : (
            <UserRound className="h-5 w-5" aria-hidden />
          )}
        </MenuTrigger>
        <MenuContent align="end" className="w-[233px]">
          <MenuLabel className="flex items-center gap-3 py-2">
            <span className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full bg-prism-value-panel-1">
              {user.image && <img src={user.image} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-prism-label font-semibold text-prism-ink">
                {user.name || handle}
              </span>
              {handle && (
                <span className="block truncate text-prism-meta font-normal text-prism-ink-2">
                  @{handle}
                </span>
              )}
            </span>
          </MenuLabel>
          <MenuItem asChild>
            <a href={getPanelHomeUrl()}>
              <LayoutDashboard aria-hidden />
              Open editor
            </a>
          </MenuItem>
          {handle && (
            <MenuItem asChild>
              <a href={`/${handle}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                View my page
              </a>
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden />
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}
