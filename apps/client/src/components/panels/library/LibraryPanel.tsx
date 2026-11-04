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
import { CreatorSection } from "./CreatorSection";
import { MembershipsPage } from "./MembershipsPage";

export function LibraryPanel() {
  const { pathname } = useLocation();
  const route = parseLibraryPath(pathname) ?? { view: "home" as const };

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
      {route.view === "memberships" && <MembershipsPage />}
      {route.view === "creator" && <CreatorSection handle={route.handle} />}
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
