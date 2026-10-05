import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useEditor } from "@/contexts/EditorContext";

/** 062 I01: /pay and ?panel=pay land on Wallet with the Send flow open. */
export default function PayRedirect() {
  const { setActivePanel } = useEditor();
  const navigate = useNavigate();
  useEffect(() => {
    setActivePanel("wallet");
    navigate("/wallet?send=1", { replace: true });
  }, [setActivePanel, navigate]);
  return null;
}
