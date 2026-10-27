"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

// Baked by the app builds (vite define). Null in development, where the check
// is skipped: there is no deployed version.json to compare against.
declare const __APP_BUILD_ID__: string | null;

const VERSION_MANIFEST_URL = "/version.json";
const POLL_INTERVAL_MS = 60_000;

async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    // cache: no-store plus a cache-busting query so the check always reaches
    // the freshly deployed file instead of an HTTP cache entry
    const response = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const manifest = (await response.json()) as { buildId?: unknown };
    return typeof manifest.buildId === "string" ? manifest.buildId : null;
  } catch {
    return null;
  }
}

/**
 * Detects that a newer build is deployed than the one this tab is running and
 * opens a dialog offering to reload. Polls the version manifest next to the
 * running app, so each app (client, admin) tracks its own deployment. Once a
 * version is dismissed it stays dismissed unless another version is deployed.
 */
export function NewVersionDialog() {
  const [outdatedBuildId, setOutdatedBuildId] = useState<string | null>(null);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!__APP_BUILD_ID__) return;
    let cancelled = false;

    const check = async () => {
      const deployedBuildId = await fetchDeployedBuildId();
      if (cancelled || !deployedBuildId || deployedBuildId === __APP_BUILD_ID__) return;
      setOutdatedBuildId(deployedBuildId);
    };

    void check();
    const interval = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const open = outdatedBuildId !== null && outdatedBuildId !== dismissedBuildId;

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) setDismissedBuildId(outdatedBuildId);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-prism-panel-title text-prism-ink">
            New version available
          </DialogTitle>
          <DialogDescription className="text-prism-body text-prism-ink-2">
            A new version of Amped Bio was deployed. Reload to get the latest features and fixes, or
            keep working and reload later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="max-sm:w-full"
            onClick={() => setDismissedBuildId(outdatedBuildId)}
          >
            Later
          </Button>
          <Button
            type="button"
            size="lg"
            className="max-sm:w-full"
            onClick={() => window.location.reload()}
          >
            <RefreshCw aria-hidden />
            Reload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
