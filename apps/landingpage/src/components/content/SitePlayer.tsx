"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MiniPlayer, PlayerProvider, type ProgressAdapter } from "@repo/ui";
import { useAuth } from "@/contexts/AuthContext";
import { trpcClient } from "@/lib/trpc";

/**
 * The public site's player (Fan Library #26 phase A). Mounted once in the
 * handle layout, so play continues between a creator's page, their feed and an
 * item page. Signed in viewers keep their position; signed out viewers play
 * without resume.
 */
export function SitePlayerProvider({ children }: { children: ReactNode }) {
  const { authUser } = useAuth();
  const signedIn = !!authUser;
  const progress = useMemo<ProgressAdapter | null>(
    () =>
      signedIn
        ? {
            load: publicId => trpcClient.progress.get.query({ publicId }),
            save: (publicId, snapshot) => {
              void trpcClient.progress.set.mutate({ publicId, ...snapshot }).catch(() => {});
            },
          }
        : null,
    [signedIn]
  );
  return (
    <PlayerProvider progress={progress}>
      {children}
      <SiteMiniPlayer />
    </PlayerProvider>
  );
}

/** Above the page's bottom capsule, inside the 610 column. */
function SiteMiniPlayer() {
  const router = useRouter();
  return (
    <div className="pointer-events-none fixed inset-x-[13px] bottom-[calc(97px+env(safe-area-inset-bottom,0px))] z-40 mx-auto max-w-[610px] [&>*]:pointer-events-auto">
      <MiniPlayer onExpand={item => item.href && router.push(item.href)} />
    </div>
  );
}
