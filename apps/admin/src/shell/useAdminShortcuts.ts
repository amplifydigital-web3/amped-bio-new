import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { ADMIN_DESTINATIONS } from "./destinations";

// Screen Review 087 I04 and I21. Cmd or Ctrl plus Alt plus a letter moves to
// a destination. The key is read from event.code, so Option on macOS (which
// changes event.key to a symbol) and other keyboard layouts still work. No
// notification fires; the rail and the top bar title show the move.
export function useAdminShortcuts() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return;
      const target = ADMIN_DESTINATIONS.find(item => item.shortcut === event.code);
      if (!target) return;
      event.preventDefault();
      if (pathname !== target.path) navigate(target.path);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate, pathname]);
}
