/**
 * The Library destination (Build Board #26, FL-3, spec 3.5 Destinations). One
 * panel serves /library and its sub paths; the Editor keeps them in the URL.
 * The page title is the top bar's; sub pages carry a Back to Library link.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@repo/ui";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS, parseLibraryPath } from "./paths";
import { LibraryHome } from "./LibraryHome";
import { LibrarySearch } from "./LibrarySearch";
import { YourCreatorsPage } from "./YourCreators";
import { SavedPage } from "./SavedPage";
import { ItemView } from "./ItemView";
import { useAuth } from "@repo/ui";
import { DownloadItemView, DownloadsPage } from "./downloads/DownloadsPage";
import { downloadsApi } from "./downloads/api";
import { useOnline } from "./downloads/OfflineDownloads";

export function LibraryPanel() {
  const { pathname } = useLocation();
  const route = parseLibraryPath(pathname) ?? { view: "home" as const };
  const { authUser } = useAuth();
  const online = useOnline();

  useEffect(() => {
    document.getElementById("editor-content")?.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-[13px] pb-[21px]">
      {route.view !== "home" && <BackToLibrary />}
      {route.view === "home" && <LibraryHome />}
      {route.view === "search" && <LibrarySearch />}
      {route.view === "creators" && <YourCreatorsPage />}
      {route.view === "saved" && <SavedPage />}
      {route.view === "downloads" && authUser && (
        <DownloadsPage account={authUser.id} online={online} api={downloadsApi} />
      )}
      {route.view === "download" && authUser && (
        <DownloadItemView account={authUser.id} publicId={route.publicId} online={online} />
      )}
      {route.view === "creator" && <CreatorPublicRedirect handle={route.handle} />}
      {route.view === "item" && <ItemView handle={route.handle} publicId={route.publicId} />}
    </div>
  );
}

function BackToLibrary() {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" className="-ml-3" onClick={() => navigate(LIBRARY_PATHS.home)}>
      <ChevronLeft aria-hidden />
      {LIBRARY_COPY.back}
    </Button>
  );
}

/**
 * The creator section is FL-4. Until it ships, /library/@handle opens the
 * creator's public page, the same place spec 3.2 sends a fan with no connection.
 */
function CreatorPublicRedirect({ handle }: { handle: string }) {
  useEffect(() => {
    window.location.assign(`${import.meta.env.VITE_LANDINGPAGE_URL}/@${handle}`);
  }, [handle]);
  return null;
}
