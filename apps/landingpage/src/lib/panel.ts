import { formatHandle } from "@/lib/handle";

/**
 * Build the apps/client URL for editing a user's page. All edit and private
 * areas live in the client app, so links from the public site must point there.
 */
export function getPanelEditUrl(handle: string): string {
  const base = process.env.NEXT_PUBLIC_PANEL_URL || "";
  if (!handle) return base || "/";
  return `${base}/${formatHandle(handle)}/edit`;
}
