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
