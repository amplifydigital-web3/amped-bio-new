import { useParams, useLocation } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { useEditor } from "../contexts/EditorContext";
import { useNavigate } from "react-router-dom";
import { normalizeOnelink, formatOnelink, isEquivalentOnelink } from "@/utils/onelink";
import { toast } from "react-hot-toast";

export function Editor() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const { profile, setUser, setActivePanel } = useEditor();
  const nav = useNavigate();
  const location = useLocation();

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(onelink);
  const formattedOnelink = formatOnelink(onelink);

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

  // Check if user is allowed to edit this page
  useEffect(() => {
    const isLoggedIn = authUser !== null;

    if (!isLoggedIn) {
      // User is not logged in, redirect to view page
      toast.error("You need to log in to edit this page");
      nav(`/${formattedOnelink}`, { replace: true });
      return;
    }

    // Now check if logged-in user owns this onelink
    const isOwner = isEquivalentOnelink(authUser.onelink, normalizedOnelink);

    if (!isOwner) {
      // User is logged in but doesn't own this onelink
      toast.error("You cannot edit this page as it belongs to another user");
      nav(`/${formattedOnelink}`, { replace: true });
      return;
    }

    // User is authorized to edit
    setAuthorized(true);
  }, [normalizedOnelink, authUser, nav, formattedOnelink]);

  // Set active panel from location state or default to home
  useEffect(() => {
    // Check if a specific panel was passed in the navigation state
    if (location.state && location.state.panel) {
      setActivePanel(location.state.panel);
    } else if (authUser === null) {
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

  // Only render the editor if the user is authorized
  if (!authorized) {
    return null; // Render nothing while redirection happens
  }

  return (
    <div className="h-screen">
      <Layout onelink={normalizedOnelink} />
    </div>
  );
}
