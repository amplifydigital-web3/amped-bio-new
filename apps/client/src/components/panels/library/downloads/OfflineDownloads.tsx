/**
 * Downloads without a connection (Build Board #26, FL-5, spec 3.5, board m12
 * offline state). The editor shell needs the API to sign in, so offline the
 * app opens this page instead: the device's copies and their player, nothing
 * else. Only the account last signed in on this device has copies here;
 * signing out deletes them.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button, PlayerProvider } from "@repo/ui";
import { LIBRARY_COPY } from "../copy";
import { LIBRARY_PATHS, parseLibraryPath } from "../paths";
import { DownloadItemView, DownloadsPage } from "./DownloadsPage";
import { deviceAccount, setActiveAccount } from "./store";

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function OfflineDownloads() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const account = deviceAccount();
  const route = parseLibraryPath(pathname);

  useEffect(() => {
    if (account !== null) setActiveAccount(account);
  }, [account]);

  return (
    <PlayerProvider>
      <div className="prism-room prism-font min-h-dvh text-prism-ink">
        <main className="mx-auto w-full max-w-[720px] space-y-[13px] px-[13px] pb-[34px] pt-[21px]">
          {route?.view === "download" && (
            <Button
              variant="ghost"
              className="-ml-3"
              onClick={() => navigate(LIBRARY_PATHS.downloads)}
            >
              <ChevronLeft aria-hidden />
              {LIBRARY_COPY.downloads.title}
            </Button>
          )}
          {online && (
            <Button variant="secondary" onClick={() => window.location.assign(LIBRARY_PATHS.home)}>
              {LIBRARY_COPY.downloads.openOnline}
            </Button>
          )}
          {account === null ? (
            <DownloadsEmpty />
          ) : route?.view === "download" ? (
            <DownloadItemView account={account} publicId={route.publicId} online={false} />
          ) : (
            <DownloadsPage account={account} online={false} api={null} />
          )}
        </main>
      </div>
    </PlayerProvider>
  );
}

function DownloadsEmpty() {
  const D = LIBRARY_COPY.downloads;
  return (
    <div className="space-y-2 pt-[34px] text-center">
      <h1 className="text-[24px] font-semibold">{D.offlineTitle}</h1>
      <p className="text-[15px] text-prism-ink-2">{LIBRARY_COPY.error.offline}</p>
    </div>
  );
}
