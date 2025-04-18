import { useParams, useLocation } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { useNavigate } from "react-router-dom";
import { defaultAuthUser } from "@/store/defaults";
import { normalizeOnelink } from "@/utils/onelink";

export function Editor() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const profile = useEditorStore(state => state.profile);
  const setUser = useEditorStore(state => state.setUser);
  const setActivePanel = useEditorStore(state => state.setActivePanel);
  const nav = useNavigate();
  const location = useLocation();

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(onelink);

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
        name: authUser!.onelink,
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

  // Redirect to URL with @ symbol if missing
  useEffect(() => {
    if (onelink && !onelink.startsWith("@")) {
      // Navigate to the same route but with @ symbol
      nav(`/@${onelink}/edit${location.search}`, { replace: true });
    }
  }, [onelink, nav, location.search]);

  // Set active panel from location state or default to home
  useEffect(() => {
    // Check if a specific panel was passed in the navigation state
    if (location.state && location.state.panel) {
      setActivePanel(location.state.panel);
    } else if (authUser === defaultAuthUser) {
      // For unauthenticated users, set to home
      setActivePanel("home");
    }
  }, [location.state, authUser, setActivePanel]);

  useEffect(() => {
    if (normalizedOnelink && normalizedOnelink !== profile.onelink) {
      setLoading(true);
      setUser(normalizedOnelink).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [normalizedOnelink, profile, setUser]);

  if (loading) {
    return <div>Loading...</div>;
  }
  return (
    <div className="h-screen">
      <Layout onelink={normalizedOnelink} />
    </div>
  );
}
