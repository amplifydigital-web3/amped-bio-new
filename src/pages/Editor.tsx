import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { useNavigate } from "react-router-dom";
import { defaultAuthUser } from "@/store/defaults";

export function Editor() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const profile = useEditorStore(state => state.profile);
  const setUser = useEditorStore(state => state.setUser);
  const setActivePanel = useEditorStore(state => state.setActivePanel);
  const nav = useNavigate();

  // Para usuários não logados, direcionar para a página Home
  useEffect(() => {
    if (authUser === defaultAuthUser) {
      // Definir a página ativa como Home
      setActivePanel("home");
    }
  }, [authUser, setActivePanel]);

  useEffect(() => {
    if (onelink && onelink !== profile.onelink) {
      setLoading(true);
      setUser(onelink).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [onelink, profile, setUser]);

  if (loading) {
    return <div>Loading...</div>;
  }
  return (
    <div className="h-screen">
      <Layout onelink={onelink} />
    </div>
  );
}
