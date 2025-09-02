import { useNavigate } from "react-router-dom";
import { useEditor } from "../contexts/EditorContext";
import {
  User,
  Palette,
  Sparkles,
  Sparkle,
  LayoutGrid,
  Image,
  CoinsIcon,
  Trophy,
  AtSign,
  Home,
  Settings,
  Wallet,
  Send,
  Search,
} from "lucide-react";
import { EditorPanelType } from "@/types/editor";

// Define all possible navigation items
const allNavItems: Array<{
  id: EditorPanelType;
  icon: React.ElementType;
  label: string;
  alwaysShow?: boolean;
  environmentFlag?: string;
}> = [
  { id: "home", icon: Home, label: "Home", alwaysShow: true },
  {
    id: "explore",
    icon: Search,
    label: "Explore",
    environmentFlag: "VITE_SHOW_CREATOR_POOL",
    alwaysShow: true,
  },
  { id: "profile", icon: User, label: "Profile", alwaysShow: true },
  { id: "gallery", icon: Image, label: "Themes", alwaysShow: true },
  { id: "appearance", icon: Palette, label: "Appearance", alwaysShow: true },
  { id: "effects", icon: Sparkles, label: "Effects", alwaysShow: true },
  { id: "blocks", icon: LayoutGrid, label: "Blocks", alwaysShow: true },
  {
    id: "wallet",
    icon: Wallet,
    label: "My Wallet",
    environmentFlag: "VITE_SHOW_WALLET",
  },
  {
    id: "pay",
    icon: Send,
    label: "Pay",
    environmentFlag: "VITE_SHOW_WALLET",
  },
  // { id: "reward", icon: Sparkle, label: "Reward", alwaysShow: false },
  { id: "account", icon: Settings, label: "Account", alwaysShow: true },
  {
    id: "rewardPools",
    icon: CoinsIcon,
    label: "Reward Pools",
    environmentFlag: "VITE_SHOW_CREATOR_POOL",
    alwaysShow: true,
  },
  // {
  //   id: "leaderboard",
  //   icon: Trophy,
  //   label: "Leaderboard",
  //   environmentFlag: "VITE_SHOW_CREATOR_POOL",
  //   alwaysShow: false,
  // },
  { id: "rns", icon: AtSign, label: "RNS", environmentFlag: "VITE_SHOW_RNS", alwaysShow: false },
];

export function Sidebar() {
  const editorState = useEditor();
  const { activePanel, setActivePanel } = editorState;
  const navigate = useNavigate();

  const handlePanelClick = (id: EditorPanelType) => {
    if (id === "account") {
      navigate("/account");
    } else {
      setActivePanel(id);
    }
  };

  return (
    <div className="w-full h-16 md:w-20 md:h-screen bg-white border-b md:border-r border-gray-200 shrink-0 z-[10] overflow-x-auto md:overflow-x-visible">
      <div className="h-full flex md:flex-col items-center justify-start md:justify-start md:py-6 px-2 md:px-0 min-w-max">
        {allNavItems.map(({ id, icon: Icon, label, alwaysShow, environmentFlag }) => {
          // Determine if item should be enabled based on environment flag or alwaysShow
          const isEnabled =
            alwaysShow || (environmentFlag && import.meta.env[environmentFlag] === "true");

          return (
            <button
              key={id}
              onClick={() => isEnabled && handlePanelClick(id)}
              className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg relative mx-1 md:mx-0 md:mb-2
                transition-all duration-200 ease-in-out transform hover:scale-105
                ${
                  isEnabled
                    ? activePanel === id
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    : "text-gray-300 cursor-not-allowed"
                }`}
              disabled={!isEnabled}
            >
              <Icon className={`w-5 h-5 ${!isEnabled ? "opacity-40" : ""}`} />
              <span
                className={`text-[0.65rem] leading-tight mt-1 w-full text-center ${!isEnabled ? "opacity-40" : ""}`}
              >
                {label}
              </span>
              {!isEnabled && (
                <span className="absolute top-0 right-0 bg-gray-200 text-gray-600 rounded-bl-lg rounded-tr-lg px-1 text-[0.6rem]">
                  Soon
                </span>
              )}
            </button>
          );
        })}

        {/* <div className="md:mt-auto md:mb-6 flex md:flex-col items-center space-x-2 md:space-x-0 md:space-y-2">
          <button
            onClick={handleExport}
            className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Export Settings"
          >
            <Download className="w-5 h-5" />
            <span className="text-xs mt-1">Export</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Import Settings"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs mt-1">Import</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div> */}
      </div>
    </div>
  );
}
