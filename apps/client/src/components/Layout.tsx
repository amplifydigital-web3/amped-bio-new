import { Banner, type BannerPanel } from "./Banner";
import { Preview } from "./Preview";
import { useEditor } from "../contexts/EditorContext";
import { CreatorPoolPanel } from "./panels/createrewardpool/CreatorPoolPanel.tsx";
import { LeaderboardPanel } from "./panels/leaderboard/LeaderboardPanel";
import { RNSPanel } from "./panels/rns/RNSPanel";
import { HomePanel } from "./panels/home/HomePanel";
import { MyWalletPanel } from "./panels/wallet/MyWalletPanel";
import RewardPanel from "./panels/reward/RewardPanel.tsx";
import PayPanel from "./panels/pay/PayPanel.tsx";
import ExplorePage from "./panels/explore/ExplorePanel.tsx";
import { AnalyticsPanel } from "./panels/analytics/AnalyticsPanel";
import { PagePanel } from "./panels/page/PagePanel";
import { DesignPanel } from "./panels/design/DesignPanel";
import { AccountPanel } from "./panels/account/AccountPanel";
import { Rail } from "./shell/Rail";
import { MobileDock } from "./shell/MobileDock";
import { MobileTopBar, TopBar } from "./shell/TopBar";
import { ShellNavigationProvider } from "./shell/ShellNavigation";
import { useSupportWidget } from "./shell/useSupportWidget";
import RNSHeader from "./rns/RNSHeader.tsx";
import type { EditorPanelType } from "@/types/editor.ts";

interface LayoutProps {
  bannerData?: {
    message: string;
    type: "info" | "warning" | "success" | "error";
    panel?: BannerPanel;
  } | null;
  bannerLoading?: boolean;
}

// The live preview shows on Page and Design only (D10)
const PREVIEW_PANELS: EditorPanelType[] = ["page", "design"];

function ActivePanel({ panel }: { panel: EditorPanelType }) {
  switch (panel) {
    case "home":
      return <HomePanel />;
    case "analytics":
      return <AnalyticsPanel />;
    case "explore":
      return <ExplorePage />;
    case "page":
      return <PagePanel />;
    case "design":
      return <DesignPanel />;
    case "wallet":
      return <MyWalletPanel />;
    case "pay":
      return <PayPanel />;
    case "my-pool":
      return <CreatorPoolPanel />;
    case "account":
      return <AccountPanel />;
    case "rns":
      // RNS navigation is the destination's own header, not the top bar (002 I08, D06)
      return import.meta.env.VITE_SHOW_RNS === "true" ? (
        <>
          <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-3">
            <RNSHeader />
            <RNSHeader mobile />
          </div>
          <RNSPanel />
        </>
      ) : null;
    case "reward":
      return <RewardPanel />;
    case "leaderboard":
      return <LeaderboardPanel />;
    default:
      return null;
  }
}

/**
 * The editor shell (Screen Review 001 to 005, D08 and D09).
 *
 * Desktop (768 and up): the rail floats at x 21; the context field starts at
 * x 131 with the 55 high top bar at y 21 and the destination below it. On Page
 * and Design the commitment field frame on the right holds the live preview
 * (1024 and up). Mobile: one compact top bar, content, and the bottom dock.
 *
 * On mobile the content clears the dock: 21 below it, 80 of dock and 13 of
 * air, plus the safe area (003 I08).
 *
 * Destinations that are not restyled yet sit on a white surface so their
 * current colors stay readable on the room. Each screen batch removes it for
 * the destinations it restyles.
 */
export function Layout({ bannerData, bannerLoading }: LayoutProps) {
  const { activePanel, profile, blocks, theme } = useEditor();
  const showPreview = PREVIEW_PANELS.includes(activePanel);
  // Load the support widget once for the session, launcher hidden (004 I01, I04)
  useSupportWidget();

  return (
    <ShellNavigationProvider>
      <div className="prism-room prism-font min-h-dvh text-prism-ink">
        <Rail />
        <MobileTopBar />

        <div className="flex gap-[21px] px-[13px] pb-[calc(114px+env(safe-area-inset-bottom,0px))] pt-[13px] md:pb-[21px] md:pl-[131px] md:pr-[21px] md:pt-[21px]">
          {/* Context field */}
          <div className="flex min-w-0 flex-1 flex-col gap-[13px] md:gap-[13px]">
            <TopBar />
            {!bannerLoading && bannerData && (
              <Banner
                message={bannerData.message || "Notice"}
                type={bannerData.type || "info"}
                panel={bannerData.panel}
              />
            )}
            <main
              id="editor-content"
              className="min-w-0 overflow-hidden rounded-prism-21 bg-white shadow-prism-e3"
            >
              <ActivePanel panel={activePanel} />
            </main>
          </div>

          {/* Commitment field frame: live preview on Page and Design (D08, D10) */}
          {showPreview && (
            <aside
              aria-label="Live preview"
              className="prism-glass-clear sticky top-[21px] hidden h-[calc(100dvh-42px)] w-[min(508px,40vw)] shrink-0 overflow-hidden !rounded-prism-34 lg:block"
            >
              <div className="h-full overflow-y-auto">
                <Preview
                  isEditing={true}
                  profile={profile}
                  blocks={blocks}
                  theme={theme}
                  userId={profile.id}
                />
              </div>
            </aside>
          )}
        </div>

        <MobileDock />
      </div>
    </ShellNavigationProvider>
  );
}
