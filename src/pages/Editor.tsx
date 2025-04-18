import { useParams } from "react-router-dom";
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

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(onelink);

  // Redirect unauthenticated users to Home page
  useEffect(() => {
    if (authUser === defaultAuthUser) {
      // Set active panel to home
      setActivePanel("home");
    }
  }, [authUser, setActivePanel]);

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
