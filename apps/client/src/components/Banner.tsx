import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Info, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  X 
} from "lucide-react";

interface BannerProps {
  message: string;
  type?: "info" | "warning" | "success" | "error";
  show?: boolean;
  onClose?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number; // in milliseconds, default 5000ms (5 seconds)
  url?: string; // Optional URL to navigate to when the banner is clicked
}

export const Banner: React.FC<BannerProps> = ({ 
  message, 
  type = "info", 
  show = true, 
  onClose,
  autoHide = false,
  autoHideDelay = 5000,
  url
}) => {
  const [isVisible, setIsVisible] = useState(show);
  const navigate = useNavigate();

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
    if (url) {
      // Check if it's an external URL or internal path
      if (url.startsWith('http')) {
        window.open(url, '_blank');
      } else {
        navigate(url);
      }
    }
  };

  return (
    <div 
      className={`p-4 ${bannerStyles[type]} border-b flex items-start ${url ? 'cursor-pointer hover:opacity-90' : ''}`}
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