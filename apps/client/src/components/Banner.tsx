import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Info, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useEditor } from "../contexts/EditorContext";

interface BannerProps {
  message: string;
  type?: "info" | "warning" | "success" | "error";
  show?: boolean;
  panel?:
    | "home"
    | "profile"
    | "reward"
    | "gallery"
    | "blocks"
    | "rewardPools"
    | "createRewardPool"
    | "leaderboard"
    | "rns"
    | "wallet"
    | "pay"
    | "account"; // Optional panel to redirect to
}

export const Banner: React.FC<BannerProps> = ({ message, type = "info", show = true, panel }) => {
  const [isVisible, setIsVisible] = useState(show);
  const navigate = useNavigate();
  const { profile } = useEditor();

  useEffect(() => {
    setIsVisible(show);
  }, [show]);

  if (!isVisible) return null;

  const bannerStyles = {
    info: "bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-cyan-400",
    warning: "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400",
    success: "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-emerald-400",
    error: "bg-gradient-to-r from-rose-500 to-red-500 text-white border-rose-400",
  };

  const iconMap = {
    info: <Info className="w-5 h-5 mr-2 text-blue-100" />,
    warning: <AlertTriangle className="w-5 h-5 mr-2 text-orange-100" />,
    success: <CheckCircle className="w-5 h-5 mr-2 text-green-100" />,
    error: <XCircle className="w-5 h-5 mr-2 text-red-100" />,
  };

  const handleClick = () => {
    if (profile && profile.handle) {
      if (panel) {
        // If a panel is specified, navigate to the user's editor route with panel state
        // The Editor component will handle setting the active panel from location.state
        navigate(`/@${profile.handle}/edit`, { state: { panel } });
      } else {
        // If no panel is specified, just navigate to the user's editor route
        navigate(`/@${profile.handle}/edit`);
      }
    } else {
      // Fallback if profile is not available (shouldn't happen in the editor context)
      console.error("Banner: Profile not available, cannot navigate to editor");
    }
  };

  return (
    <div
      className={`p-4 ${bannerStyles[type]} border-b flex items-start cursor-pointer hover:opacity-90`}
      onClick={handleClick}
    >
      <div className="flex items-center">
        {iconMap[type]}
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
};
