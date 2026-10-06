import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Button, cn } from "@repo/ui";
import type { BannerPanelValue } from "@repo/constants";
import type { EditorPanelType } from "@/types/editor";
import { useShellNavigation } from "./shell/ShellNavigation";
import { PANEL_TITLES } from "./shell/destinations";

// Values a stored banner can name (public.getBanner): the live destinations
// plus legacy values saved before D01 (Screen Review 098 I07, I11).
export type BannerPanel = BannerPanelValue;

// Legacy banner values mapped to the D01 destinations (Screen Review 005 I04,
// I08, 098 I07). Hidden panels (D22) get no button.
const BANNER_DESTINATIONS: Partial<Record<BannerPanel, { panel: EditorPanelType; tab?: string }>> =
  {
    home: { panel: "home" },
    explore: { panel: "explore" },
    page: { panel: "page" },
    design: { panel: "design" },
    analytics: { panel: "analytics" },
    wallet: { panel: "wallet" },
    "my-pool": { panel: "my-pool" },
    account: { panel: "account" },
    profile: { panel: "page" },
    blocks: { panel: "page" },
    gallery: { panel: "design", tab: "themes" },
    pay: { panel: "wallet" },
    rns: { panel: "wallet" },
    createRewardPool: { panel: "my-pool" },
    rewardPools: { panel: "explore" },
    leaderboard: { panel: "explore" },
  };

type BannerType = "info" | "warning" | "success" | "error";

interface BannerProps {
  message: string;
  type?: BannerType;
  panel?: BannerPanel;
}

const DISMISS_KEY = "amped:dismissed-announcement";

function messageKey(message: string, type: BannerType) {
  // Short stable hash of text plus type, so a new message shows again (I05)
  let hash = 0;
  const input = `${type}:${message}`;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return String(hash);
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Screen Review 005 (D16). The announcement is an in flow notice at the top of
 * the destination content, under the top bar. Info and success on G1 clear,
 * warning and error on the solid notice, text 16/24 ink. An explicit Open
 * button appears only when the admin set a destination; a 44 button dismisses
 * it until the message changes.
 */
export function Banner({ message, type = "info", panel }: BannerProps) {
  const { go } = useShellNavigation();
  const key = messageKey(message, type);
  const [dismissed, setDismissed] = useState(() => readDismissed() === key);
  const [entered, setEntered] = useState(false);
  // Clip only while expanding, so the glass shadow is not cut afterwards
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed() === key);
  }, [key]);

  // Expand from 0 height over 233ms (I07). Instant under reduced motion.
  // requestAnimationFrame does not run in a hidden tab, so a notice mounted in
  // a background tab opens at once instead of waiting (QA-003).
  useEffect(() => {
    const instant =
      document.visibilityState === "hidden" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (instant) {
      setEntered(true);
      setSettled(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep the clip until the row has opened. The timer only starts once the
  // expansion has started, in case transitionend never fires.
  useEffect(() => {
    if (!entered || settled) return;
    const settle = setTimeout(() => setSettled(true), 300);
    return () => clearTimeout(settle);
  }, [entered, settled]);

  if (dismissed) return null;

  const destination = panel ? BANNER_DESTINATIONS[panel] : undefined;
  const solid = type === "warning" || type === "error";
  const Icon = type === "success" ? CheckCircle2 : solid ? AlertTriangle : Info;
  const iconColor =
    type === "success" ? "text-prism-success" : solid ? "text-prism-warning-ink" : "text-prism-nav";

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {
      // Storage can be blocked; the notice still hides for this visit
    }
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-prism-control ease-prism motion-reduce:transition-none",
        entered ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
      onTransitionEnd={event => {
        // Only the row's own expansion; transitions inside the notice bubble up
        if (event.target === event.currentTarget && entered) setSettled(true);
      }}
    >
      <div className={cn("min-h-0", settled ? "overflow-visible" : "overflow-hidden")}>
        <div
          role={type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 py-[13px] pl-[13px] pr-2 font-prism",
            solid ? "prism-notice" : "prism-glass-clear !rounded-prism-13"
          )}
        >
          <Icon aria-hidden className={cn("mt-0.5 h-[21px] w-[21px] shrink-0", iconColor)} />
          <div className="min-w-0 flex-1 text-[16px] leading-6 text-prism-ink">
            <p className="max-w-[610px]">
              {type === "error" && (
                <span className="font-bold text-prism-warning-ink">Action needed </span>
              )}
              {message}
            </p>
            {destination && (
              <Button
                variant="ghost"
                className="-ml-3 mt-1"
                onClick={() => go(destination.panel, { tab: destination.tab })}
              >
                Open {PANEL_TITLES[destination.panel]}
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
          >
            <X aria-hidden className="h-[21px] w-[21px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
