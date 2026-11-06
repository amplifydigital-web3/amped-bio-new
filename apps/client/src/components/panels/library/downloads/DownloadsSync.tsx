/**
 * Keeps this device's downloads honest (Build Board #26, FL-5, spec 3.5):
 * registers the app worker while fanLibrary is on, checks access when the app
 * opens, every 6 hours while it stays open, and when the connection returns,
 * and keeps only the signed in account's copies on the device.
 */
import { useEffect } from "react";
import { LIBRARY_DOWNLOADS } from "@repo/constants";
import { useAuth } from "@repo/ui";
import { isFeatureOn } from "@/config/featureFlags";
import { downloadsApi } from "./api";
import { setAppOffline, watchInstallPrompt } from "./appWorker";
import { checkDownloads, clearDevice, flushPending, setActiveAccount } from "./store";

let watching = false;

export function DownloadsSync() {
  const { authUser, isPending } = useAuth();
  const on = isFeatureOn("fanLibrary");
  const account = authUser?.id ?? null;

  useEffect(() => {
    if (!watching) {
      watching = true;
      watchInstallPrompt();
    }
    void setAppOffline(on);
    // Flag off: the worker drops the files; the lists go with them
    if (!on) void clearDevice();
  }, [on]);

  useEffect(() => {
    if (!on || isPending || account === null) return;
    setActiveAccount(account);
    // One account's copies per device: another account's go
    void clearDevice(account);
    // Prefetch the screen, so it is in the app shell for the next time offline
    void import("./DownloadsPage");

    const run = () => {
      if (!navigator.onLine) return;
      void flushPending(downloadsApi, account)
        .then(() => checkDownloads(downloadsApi, account))
        .catch(() => {});
    };
    run();
    const timer = window.setInterval(run, LIBRARY_DOWNLOADS.checkEveryMs);
    window.addEventListener("online", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
    };
  }, [on, isPending, account]);

  return null;
}
