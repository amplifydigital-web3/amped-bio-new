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
import { EDITOR_PANELS, EditorPanelType } from "@/types/editor";

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

  // Initialize Freshworks help widget
  useEffect(() => {
    // Set widget settings
    window.fwSettings = {
      widget_id: 154000003550,
    };

    // Initialize Freshworks Widget
    if (typeof window.FreshworksWidget !== "function") {
      const n = function (...args: any[]) {
        n.q.push(args);
      };
      n.q = [];
      window.FreshworksWidget = n;
    }

    // Load the script
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://widget.freshworks.com/widgets/154000003550.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    window.FreshworksWidget(
      "identify",
      "ticketForm",
      {
        name: authUser!.handle,
        email: authUser!.email,
      },
      {
        formId: 1234, // Ticket Form ID
      }
    );

    // Cleanup function to remove the script when component unmounts
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      // Clean up the global variable
      delete window.FreshworksWidget;
      delete window.fwSettings;
    };
  }, []);

  // Normalize the URL: panels live as path segments (e.g. /gallery).
  // Backward compatible with the legacy /@handle/edit/... and ?p= routes.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hadPanelParam = searchParams.has("p");
    const queryPanel = searchParams.get("p");
    searchParams.delete("p");
    const query = searchParams.toString();

    const rawPanel = panelParam || queryPanel;
    const panel =
      rawPanel && (EDITOR_PANELS as readonly string[]).includes(rawPanel)
        ? (rawPanel as EditorPanelType)
        : ((location.state?.panel as EditorPanelType | undefined) ?? "home");

    const target = `/${panel}${query ? `?${query}` : ""}`;

    // If the segment is not a known panel and looks like a profile handle, the
    // public profile lives on the landing site, so redirect there.
    if (rawPanel && !(EDITOR_PANELS as readonly string[]).includes(rawPanel)) {
      if (validateHandleFormat(normalizeHandle(rawPanel))) {
        window.location.href = `${import.meta.env.VITE_LANDING_URL}/${formatHandle(rawPanel)}`;
        return;
      }
    }

    if (location.pathname !== target || hadPanelParam) {
      nav(target, { replace: true });
    }
    setActivePanel(panel);
  }, [panelParam, legacyHandle, location, nav, setActivePanel]);

  // Check if the user is allowed to use the dashboard
  useEffect(() => {
    const isLoggedIn = authUser !== null;

    if (!isLoggedIn) {
      // User is not logged in, redirect to the login page on the public site
      toast.error("You need to log in to use the dashboard");
      window.location.href = `${import.meta.env.VITE_LANDING_URL}/login`;
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
        <Layout handle={userHandle} bannerData={bannerData} bannerLoading={bannerLoading} />
      </div>
    </div>
  );
}
