import { useParams, useLocation } from "react-router";
import { Layout } from "../components/Layout";
import { useAuth } from "@repo/ui";
import { useEffect, useState } from "react";
import { useEditor } from "../contexts/EditorContext";
import { useNavigate } from "react-router";
import { normalizeHandle, formatHandle, validateHandleFormat } from "@repo/ui";
import { toast } from "react-hot-toast";
import { trpc } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { EDITOR_PANELS, EditorPanelType, LEGACY_PANEL_REDIRECTS } from "@/types/editor";

export function Editor() {
  const { panel: panelParam, handle: legacyHandle } = useParams();
  const { authUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const { profile, setUser, setActivePanel } = useEditor();
  const nav = useNavigate();
  const location = useLocation();

  // Fetch the public banner data from the database
  const { data: bannerData, isLoading: bannerLoading } = useQuery(
    trpc.public.getBanner.queryOptions()
  );

  // The dashboard is tied to the logged-in user, not to a handle in the URL
  const userHandle = authUser?.handle ?? "";

  // Normalize the URL: panels live as path segments (e.g. /gallery).
  // Backward compatible with the legacy /@handle/edit/... and ?p= routes.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hadPanelParam = searchParams.has("p");
    const queryPanel = searchParams.get("p");
    searchParams.delete("p");

    let rawPanel = panelParam || queryPanel;

    // Legacy destinations land on their new home (Screen Review 001 I01, I12)
    const legacy = rawPanel ? LEGACY_PANEL_REDIRECTS[rawPanel] : undefined;
    if (legacy) {
      rawPanel = legacy.panel;
      if (legacy.tab && !searchParams.has("tab")) searchParams.set("tab", legacy.tab);
    }
    const query = searchParams.toString();

    const panel =
      rawPanel && (EDITOR_PANELS as readonly string[]).includes(rawPanel)
        ? (rawPanel as EditorPanelType)
        : ((location.state?.panel as EditorPanelType | undefined) ?? "home");

    const targetPath = `/${panel}`;
    const targetSearch = query ? `?${query}` : "";

    // If the segment is not a known panel and looks like a profile handle, the
    // public profile lives on the landing site, so redirect there.
    if (rawPanel && !(EDITOR_PANELS as readonly string[]).includes(rawPanel)) {
      if (validateHandleFormat(normalizeHandle(rawPanel))) {
        window.location.href = `${import.meta.env.VITE_LANDINGPAGE_URL}/${formatHandle(rawPanel)}`;
        return;
      }
    }

    // Compare path and search separately: `location.pathname` never contains the
    // query string, so comparing it against a target that includes `?query`
    // would always be truthy and navigate on every render (replaceState loop).
    if (
      location.pathname !== targetPath ||
      location.search !== targetSearch ||
      hadPanelParam ||
      legacy
    ) {
      nav(`${targetPath}${targetSearch}`, { replace: true });
    }
    setActivePanel(panel);
  }, [panelParam, legacyHandle, location, nav, setActivePanel]);

  // Check if the user is allowed to use the dashboard
  useEffect(() => {
    const isLoggedIn = authUser !== null;

    if (!isLoggedIn) {
      // User is not logged in, redirect to the login page on the public site
      toast.error("You need to log in to use the dashboard");
      window.location.href = `${import.meta.env.VITE_LANDINGPAGE_URL}/login`;
      return;
    }

    // User is authorized to use the dashboard
    setAuthorized(true);
  }, [authUser]);

  useEffect(() => {
    if (userHandle && userHandle !== profile.handle) {
      setLoading(true);
      setUser(userHandle).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [userHandle, profile, setUser]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // Only render the editor if the user is authorized
  if (!authorized) {
    return null; // Render nothing while redirection happens
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Layout bannerData={bannerData} bannerLoading={bannerLoading} />
      </div>
    </div>
  );
}
