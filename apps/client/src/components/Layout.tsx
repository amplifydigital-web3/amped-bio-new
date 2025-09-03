import { Link } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Preview } from "./Preview";
import { UserMenu } from "./auth/UserMenu";
import SaveButton from "./panels/SaveButton.tsx";
import { useEditor } from "../contexts/EditorContext";
import { ProfilePanel } from "./panels/profile/ProfilePanel";
import { GalleryPanel } from "./panels/gallery/GalleryPanel";
import { AppearancePanel } from "./panels/appearance/AppearancePanel";
import { EffectsPanel } from "./panels/effects/EffectsPanel";
import { BlocksPanel } from "./panels/blocks/BlocksPanel";
import { CreatorPoolPanel } from "./panels/createrewardpool/CreatorPoolPanel.tsx";
import { LeaderboardPanel } from "./panels/leaderboard/LeaderboardPanel";
import { RNSPanel } from "./panels/rns/RNSPanel";
import { HomePanel } from "./panels/home/HomePanel";
import { MyWalletPanel } from "./panels/wallet/MyWalletPanel";
import { Eye } from "lucide-react";
import RewardPanel from "./panels/reward/RewardPanel.tsx";
import { EditorPanelType } from "@/types/editor.ts";
import PayPanel from "./panels/pay/PayPanel.tsx";
// import RewardsPage from "./panels/rewardpools/RewardsPanel.tsx";
import ExplorePage from "./panels/explore/ExplorePanel.tsx";

interface LayoutProps {
  onelink: string;
}

interface PanelConfig {
  layout: "single" | "two-column";
  width: "standard" | "wide" | "full";
}

export function Layout(props: LayoutProps) {
  const { onelink } = props;
  const { activePanel, profile, blocks, theme } = useEditor();
  // const emailVerified = useAuth(state => state.authUser.emailVerified);

  // Define layout configuration for each panel
  const panelConfigs: Record<EditorPanelType, PanelConfig> = {
    // Single column pages (full width)
    home: { layout: "single", width: "full" },
    explore: { layout: "single", width: "full" },
    reward: { layout: "single", width: "full" },
    wallet: { layout: "single", width: "full" },
    pay: { layout: "single", width: "full" },
    account: { layout: "single", width: "full" },

    // Two column pages with wide panels (for data-heavy content)
    rewardPools: { layout: "single", width: "full" },
    createRewardPool: { layout: "single", width: "full" },
    leaderboard: { layout: "two-column", width: "wide" },
    rns: { layout: "two-column", width: "wide" },

    // Two column pages with standard panels (for editing/configuration)
    gallery: { layout: "two-column", width: "standard" },
    profile: { layout: "two-column", width: "standard" },
    appearance: { layout: "two-column", width: "standard" },
    effects: { layout: "two-column", width: "standard" },
    blocks: { layout: "two-column", width: "standard" },
  };

  const currentConfig = panelConfigs[activePanel as EditorPanelType] || {
    layout: "two-column",
    width: "standard",
  };
  const isSingleColumn = currentConfig.layout === "single";
  const isWidePanel = currentConfig.width === "wide";

  // Consistent panel widths - increased by 50px
  const panelWidth = isWidePanel ? "md:w-[850px]" : "md:w-[450px]";

  // Show preview only for two-column layouts
  const showPreview = !isSingleColumn;

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row w-full">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header - Now always visible regardless of panel */}
          <div className="h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm z-[10] overflow-x-auto">
            {/* View Button - Only show for logged in users */}
            <div className="max-h-10 flex-shrink-0">
              <Link
                to={`/${onelink}`}
                className="px-2 py-1 md:px-4 md:py-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-1 md:space-x-2"
              >
                <Eye className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-xs md:text-sm font-medium">View Page</span>
              </Link>
            </div>

            <div className="flex items-center justify-end flex-shrink-0 ml-2">
              <SaveButton />
              <UserMenu />
            </div>
          </div>

          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Panel Container */}
            <div
              className={`w-full ${
                isSingleColumn ? "md:w-full" : `border-b md:border-b-0 md:border-r ${panelWidth}`
              } border-gray-200 bg-white overflow-y-auto flex-shrink-0 z-[10] max-h-full`}
              style={{ height: "calc(100vh - 64px)" }}
            >
              {activePanel === "home" && <HomePanel />}
              {activePanel === "explore" && <ExplorePage />}
              {activePanel === "profile" && <ProfilePanel />}
              {activePanel === "reward" && <RewardPanel />}
              {activePanel === "gallery" && <GalleryPanel />}
              {activePanel === "appearance" && <AppearancePanel />}
              {activePanel === "effects" && <EffectsPanel />}
              {activePanel === "blocks" && <BlocksPanel />}
              {activePanel === "wallet" && <MyWalletPanel />}
              {activePanel === "pay" && <PayPanel />}
              {/* {activePanel === "rewardPools" && <RewardsPage />} */}
              {activePanel === "createRewardPool" && <CreatorPoolPanel />}
              {activePanel === "leaderboard" && <LeaderboardPanel />}
              {activePanel === "rns" && <RNSPanel />}
            </div>

            {/* Preview Container - Only shown for two-column layouts */}
            {showPreview && (
              <div className="hidden md:flex md:flex-col md:flex-1 overflow-y-auto relative z-[5] bg-gray-100">
                <Preview
                  isEditing={true}
                  onelink={onelink}
                  profile={profile}
                  blocks={blocks}
                  theme={theme}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
