import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Info, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  X 
} from "lucide-react";
import { useEditor } from "../contexts/EditorContext";

interface BannerProps {
  message: string;
  type?: "info" | "warning" | "success" | "error";
  show?: boolean;
  onClose?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number; // in milliseconds, default 5000ms (5 seconds)
  panel?: "home" | "profile" | "reward" | "gallery" | "blocks" | "rewardPools" | "createRewardPool" | "leaderboard" | "rns" | "wallet" | "pay" | "account"; // Optional panel to redirect to
}

export const Banner: React.FC<BannerProps> = ({ 
  message, 
  type = "info", 
  show = true, 
  onClose,
  autoHide = false,
  autoHideDelay = 5000,
  panel
}) => {
  const [isVisible, setIsVisible] = useState(show);
  const navigate = useNavigate();
  const { setActivePanel, profile } = useEditor();

  useEffect(() => {
    setIsVisible(show);
  }, [show]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (autoHide && isVisible) {
      timer = setTimeout(() => {
        setIsVisible(false);
        if (onClose) onClose(); // Call onClose when auto-hiding
      }, autoHideDelay);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [autoHide, isVisible, onClose, autoHideDelay]);

  if (!isVisible) return null;

  const bannerStyles = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
  };

  const iconMap = {
    info: <Info className="w-5 h-5 mr-2" />,
    warning: <AlertTriangle className="w-5 h-5 mr-2" />,
    success: <CheckCircle className="w-5 h-5 mr-2" />,
    error: <XCircle className="w-5 h-5 mr-2" />,
  };

  const handleClick = () => {
    if (profile && profile.onelink) {
      if (panel) {
        // If a panel is specified, navigate to the user's editor route with panel state
        // The Editor component will handle setting the active panel from location.state
        navigate(`/@${profile.onelink}/edit`, { state: { panel } });
      } else {
        // If no panel is specified, just navigate to the user's editor route
        navigate(`/@${profile.onelink}/edit`);
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
      {(onClose || autoHide) && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // Prevent click from propagating to the banner container
            setIsVisible(false);
            if (onClose) onClose();
          }}
          className="ml-auto text-current hover:opacity-75 focus:outline-none"
          aria-label="Close banner"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};