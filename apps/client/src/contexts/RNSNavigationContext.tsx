import { useLocation, useNavigate } from "react-router";
import { useEditor } from "./EditorContext";
import { useCallback, useMemo } from "react";

// Define the possible RNS views
export type RNSView =
  | { type: "home" }
  | { type: "profile"; name: string }
  | { type: "register"; name: string }
  | { type: "address"; address: string }
  | { type: "success" }
  | { type: "my-names" };

// Helper to build the t param string used by setActivePanelAndNavigate
const buildTParam = (view: RNSView) => {
  switch (view.type) {
    case "home":
      return "home";
    case "register":
      return `register:${encodeURIComponent(view.name)}`;
    case "my-names":
      return "my-names";
    case "profile":
      return `profile:${encodeURIComponent(view.name)}`;
    case "address":
      return `address:${encodeURIComponent(view.address)}`;
    case "success":
      return "success";
    default:
      return "home";
  }
};

const parseTParam = (t?: string | null): RNSView => {
  if (!t) return { type: "home" };
  const parts = t.split(":");
  const [a, b] = parts;
  if (a === "home") return { type: "home" };
  if (a === "register" && b) return { type: "register", name: decodeURIComponent(b) };
  if (a === "my-names") return { type: "my-names" };
  if (a === "profile" && b) {
    return { type: "profile", name: decodeURIComponent(b) };
  }
  if (a === "address" && b) return { type: "address", address: decodeURIComponent(b) };
  if (a === "success") return { type: "success" };
  return { type: "home" };
};

export const useRNSNavigation = () => {
  const { setActivePanelAndNavigate } = useEditor();
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(location.search);
  const t = searchParams.get("t");
  const currentView = parseTParam(t);

  const navigateToView = useCallback(
    (view: RNSView) => {
      // ensure the editor panel is set to rns and url updated
      const tParam = buildTParam(view);
      setActivePanelAndNavigate("rns", tParam);
    },
    [setActivePanelAndNavigate]
  );

  return useMemo(
    () => ({
      currentView,
      navigateToHome: () => navigateToView({ type: "home" }),
      navigateToProfile: (name: string) => navigateToView({ type: "profile", name }),
      navigateToRegister: (name: string) => navigateToView({ type: "register", name }),
      navigateToAddress: (address: string) => navigateToView({ type: "address", address }),
      navigateToSuccess: () => navigateToView({ type: "success" }),
      navigateToMyNames: () => navigateToView({ type: "my-names" }),
      goBack: () => navigate(-1),
    }),
    [currentView, navigateToView, navigate]
  );
};
