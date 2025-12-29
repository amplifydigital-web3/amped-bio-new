import React from "react";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { OnelinkStatus } from "@/utils/handle";

interface URLStatusIndicatorProps {
  status: OnelinkStatus;
  isCurrentUrl?: boolean;
  compact?: boolean; // Added to support compact mode for AuthModal
}

export function URLStatusIndicator({
  status,
  isCurrentUrl,
  compact = false,
}: URLStatusIndicatorProps) {
  // If it's the current URL, show it as "Current" regardless of other status
  const displayStatus = isCurrentUrl ? "Current" : status;

  // Use smaller icons when compact mode is enabled
  const iconSize = compact ? "h-3 w-3" : "h-4 w-4";

  switch (displayStatus) {
    case "Available":
      return (
        <Tooltip content="This URL is available">
          <div className="flex items-center text-green-600">
            <CheckCircle className={iconSize} />
          </div>
        </Tooltip>
      );
    case "Current":
      return (
        <Tooltip content="This is your current URL">
          <div className="flex items-center text-blue-600">
            <CheckCircle className={iconSize} />
          </div>
        </Tooltip>
      );
    case "Taken":
    case "Unavailable":
      return (
        <Tooltip content="This URL is already taken">
          <div className="flex items-center text-red-600">
            <XCircle className={iconSize} />
          </div>
        </Tooltip>
      );
    case "Checking":
      return (
        <Tooltip content="Checking availability...">
          <div className="flex items-center text-yellow-600">
            <Clock className={`${iconSize} animate-spin`} />
          </div>
        </Tooltip>
      );
    case "Invalid":
      return (
        <Tooltip content="URL contains invalid characters">
          <div className="flex items-center text-red-600">
            <AlertCircle className={iconSize} />
          </div>
        </Tooltip>
      );
    case "TooShort":
      return (
        <Tooltip content="URL is too short">
          <div className="flex items-center text-red-600">
            <AlertCircle className={iconSize} />
          </div>
        </Tooltip>
      );
    default:
      return null;
  }
}
