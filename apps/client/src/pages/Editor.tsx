import { useParams, useLocation } from "react-router";
import { Layout } from "../components/Layout";
import { useAuth } from "@repo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../contexts/EditorContext";
import { useNavigate } from "react-router";
import { normalizeHandle, formatHandle, validateHandleFormat } from "@repo/ui";
import { trpc } from "@repo/ui";
import { PANEL_TITLES } from "@/components/shell/destinations";
import { PREVIEW_PATHS, SHELL_TIMEOUT_MS, ShellErrorCard } from "@/components/shell/ShellGate";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { useDelayed } from "@/hooks/useDelayed";
import { useQuery } from "@tanstack/react-query";
import {
  EDITOR_PANELS,
  EditorPanelType,
  LEGACY_PANEL_REDIRECTS,
  LEGACY_PROFILE_TABS,
} from "@/types/editor";

/**
 * QA-045: the editor's own loading state. The room paints at once, then the
 * shell skeleton after 400ms. The sign in timeout card belongs to
 * ProtectedRoute; a slow profile load ends in the editor's load error.
 */
function EditorLoading() {
  const showSkeleton = useDelayed(true, 400);
  useEffect(() => {
    document.title = "Amped.Bio";
  }, []);
  if (!showSkeleton) return <div className="prism-room min-h-dvh" />;
  const preview = PREVIEW_PATHS.some(path => window.location.pathname.startsWith(path));
  return <ShellSkeleton preview={preview} />;
}

export function Editor() {
  const { panel: panelParam, handle: legacyHandle } = useParams();
  const { authUser } = useAuth();
  // 081 I01, I07: the profile load. "failed" shows the editor load error.
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
  // QA-045: one profile request at a time. Retry while a request is still
  // running waits for it instead of starting a second setUser.
  const inFlight = useRef<{ handle: string; promise: Promise<unknown> } | null>(null);
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

  const loadProfile = useCallback(
    (handle: string) => {
      const current = inFlight.current;
      if (current && current.handle === handle) return current.promise;
      const promise: Promise<unknown> = setUser(handle).finally(() => {
        if (inFlight.current?.promise === promise) inFlight.current = null;
      });
      inFlight.current = { handle, promise };
      return promise;
    },
    [setUser]
  );

  // ProtectedRoute owns the signed out redirect (with returnTo, 081 I05, I06);
  // the editor only loads the signed in creator's profile.
  useEffect(() => {
    if (!authUser) return;
    // QA-045: a session without a handle has no page to load; say so instead
    // of waiting forever
    if (!userHandle) {
      setLoad("failed");
      return;
    }
    if (userHandle === profile.handle) {
      setLoad("ready");
      return;
    }
    let active = true;
    setLoad("loading");
    // A load that runs past the timeout shows the error; it still lands if it
    // finishes later
    const timer = setTimeout(() => {
      if (active) setLoad(current => (current === "loading" ? "failed" : current));
    }, SHELL_TIMEOUT_MS);
    void loadProfile(userHandle).then(loaded => {
      clearTimeout(timer);
      if (active) setLoad(loaded ? "ready" : "failed");
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // profile.handle changes when setUser succeeds; attempt reruns a failed load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, userHandle, attempt, loadProfile]);

  // Without a handle a new attempt cannot help; a reload reads the session again
  const retry = useCallback(() => {
    if (!userHandle) {
      window.location.reload();
      return;
    }
    setAttempt(current => current + 1);
  }, [userHandle]);

  // 081 I03: <Destination> · Amped.Bio once loaded
  useEffect(() => {
    if (load === "ready") document.title = `${PANEL_TITLES[activePanel]} · Amped.Bio`;
  }, [load, activePanel]);

  if (!authUser) return null;
  if (load === "failed") {
    return (
      <ShellErrorCard
        title="We could not load your page."
        cause={
          userHandle
            ? "Check your connection, then try again."
            : "Your account has no page name yet. Contact support if this keeps happening."
        }
        onRetry={retry}
      />
    );
  }
  if (load === "loading") return <EditorLoading />;

  // The Prism shell scrolls the page itself (fixed rail and dock, sticky
  // preview), so no viewport-height or overflow wrapper goes around it
  return <Layout bannerData={bannerData} bannerLoading={bannerLoading} />;
}
