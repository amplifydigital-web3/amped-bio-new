import type { ReactNode } from "react";
import { SitePlayerProvider } from "@/components/content/SitePlayer";

/**
 * One player for a creator's page, feed and item pages (Fan Library #26 phase
 * A), so play keeps going while a visitor moves between them.
 */
export default function HandleLayout({ children }: { children: ReactNode }) {
  return <SitePlayerProvider>{children}</SitePlayerProvider>;
}
