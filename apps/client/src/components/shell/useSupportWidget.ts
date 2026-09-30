import { useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@repo/ui";

// Screen Review 004. The Freshworks support widget, loaded once per session.
// The floating launcher is hidden everywhere (I01); Help menus open the form.

const WIDGET_ID = 154000003550;
const SCRIPT_ID = "freshworks-widget";
export const HELP_ARTICLES_URL = "https://amplifydigital.freshdesk.com/support/solutions";
export const SUPPORT_PORTAL_URL = "https://amplifydigital.freshdesk.com/support/home";
export const TELEGRAM_URL = "https://t.me/the_revolution_network";
// If the widget has not loaded this long after Contact support, open the portal (I05)
const LOAD_TIMEOUT_MS = 5000;

let loaded = false;

function ensureWidget() {
  window.fwSettings = { widget_id: WIDGET_ID };
  if (typeof window.FreshworksWidget !== "function") {
    const queue = function (...args: unknown[]) {
      queue.q.push(args);
    } as ((...args: unknown[]) => void) & { q: unknown[][] };
    queue.q = [];
    window.FreshworksWidget = queue;
  }
  // Load the script once per session (I04). Destination changes never reload it.
  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://widget.freshworks.com/widgets/${WIDGET_ID}.js`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      loaded = true;
    };
    document.body.appendChild(script);
  }
  window.FreshworksWidget("hide", "launcher");
}

export function useSupportWidget() {
  const { authUser } = useAuth();

  useEffect(() => {
    ensureWidget();
  }, []);

  // Prefill the ticket form with the handle and email (kept from the old widget)
  useEffect(() => {
    if (!authUser || typeof window.FreshworksWidget !== "function") return;
    window.FreshworksWidget("identify", "ticketForm", {
      name: authUser.handle,
      email: authUser.email,
    });
  }, [authUser]);

  const openContactForm = useCallback(() => {
    ensureWidget();
    window.FreshworksWidget?.("open", "ticketForm");
    if (loaded) return;
    const started = Date.now();
    const check = window.setInterval(() => {
      if (loaded) {
        window.clearInterval(check);
      } else if (Date.now() - started >= LOAD_TIMEOUT_MS) {
        window.clearInterval(check);
        window.open(SUPPORT_PORTAL_URL, "_blank", "noopener,noreferrer");
        toast("Support opened in a new tab");
      }
    }, 250);
  }, []);

  return { openContactForm };
}
