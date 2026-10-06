import { useParams, useLocation } from "react-router";
import { Layout } from "../components/Layout";
import { useAuth } from "@repo/ui";
import { useCallback, useEffect, useState } from "react";
import { useEditor } from "../contexts/EditorContext";
import { useNavigate } from "react-router";
import { normalizeHandle, formatHandle, validateHandleFormat } from "@repo/ui";
import { trpc } from "@repo/ui";
import { PANEL_TITLES } from "@/components/shell/destinations";
import { ShellErrorCard, ShellPending } from "@/components/shell/ShellGate";
import { useQuery } from "@tanstack/react-query";
import {
  EDITOR_PANELS,
  EditorPanelType,
  LEGACY_PANEL_REDIRECTS,
  LEGACY_PROFILE_TABS,
} from "@/types/editor";

export function Editor() {
  const { panel: panelParam, handle: legacyHandle } = useParams();
  const { authUser } = useAuth();
  // 081 I01, I07: the profile load. "failed" shows the shell error card.
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const { profile, setUser, setActivePanel, activePanel } = useEditor();
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
    const profileTab =
      rawPanel === "profile" ? LEGACY_PROFILE_TABS[searchParams.get("tab") ?? ""] : undefined;
    if (profileTab) {
      rawPanel = "design";
      searchParams.set("tab", profileTab);
    } else if (legacy) {
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

  // ProtectedRoute owns the signed out redirect (with returnTo, 081 I05, I06);
  // the editor only loads the signed in creator's profile.
  useEffect(() => {
    if (!userHandle) return;
    if (userHandle === profile.handle) {
      setLoad("ready");
      return;
    }
    let active = true;
    setLoad("loading");
    void setUser(userHandle).then(loaded => {
      if (active) setLoad(loaded ? "ready" : "failed");
    });
    return () => {
      active = false;
    };
    // profile.handle changes when setUser succeeds; attempt reruns a failed load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userHandle, attempt, setUser]);

  const retry = useCallback(() => setAttempt(current => current + 1), []);

  // 081 I03: <Destination> · Amped.Bio once loaded
  useEffect(() => {
    if (load === "ready") document.title = `${PANEL_TITLES[activePanel]} · Amped.Bio`;
  }, [load, activePanel]);

  if (!authUser) return null;
  if (load === "failed") {
    return (
      <ShellErrorCard
        title="Your editor did not load"
        cause="We could not load your page details. Check your connection, then try again."
        onRetry={retry}
      />
    );
  }
  if (load === "loading") return <ShellPending onRetry={retry} />;

  // The Prism shell scrolls the page itself (fixed rail and dock, sticky
  // preview), so no viewport-height or overflow wrapper goes around it
  return <Layout bannerData={bannerData} bannerLoading={bannerLoading} />;
}
