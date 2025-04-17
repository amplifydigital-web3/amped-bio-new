import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { URLStatus } from "@/hooks/useOnelinkAvailability";

interface URLStatusIndicatorProps {
  status: URLStatus;
  isCurrentUrl?: boolean;
  compact?: boolean;
}

export function URLStatusIndicator({
  status,
  isCurrentUrl = false,
  compact = false,
}: URLStatusIndicatorProps) {
  // Special case: URL is the current onelink
  if (isCurrentUrl) {
    return (
      <div className="flex items-center text-blue-600 whitespace-nowrap">
        <CheckCircle className="w-4 h-4 mr-1 flex-shrink-0" />
        <span className={compact ? "text-xs" : ""}>
          {compact ? "Current URL" : "Current handle"}
        </span>
      </div>
    );
  }

  switch (status) {
    case "Checking...":
      return (
        <div className="flex items-center text-amber-500 whitespace-nowrap">
          <Loader2 className={`w-4 h-4 ${compact ? "mr-1" : "mr-2"} animate-spin flex-shrink-0`} />
          <span className={compact ? "text-xs" : ""}>Checking...</span>
        </div>
      );
    case "Available":
      return (
        <div className="flex items-center text-green-600 whitespace-nowrap">
          <CheckCircle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className={compact ? "text-xs" : ""}>Available</span>
        </div>
      );
    case "Unavailable":
      return (
        <div className="flex items-center text-red-600 whitespace-nowrap">
          <XCircle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className={compact ? "text-xs" : ""}>Unavailable</span>
        </div>
      );
    case "Invalid":
      return (
        <div className="flex items-center text-red-600 whitespace-nowrap">
          <XCircle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className={compact ? "text-xs" : ""}>Invalid</span>
        </div>
      );
    case "TooShort":
      return (
        <div className="flex items-center text-amber-500 whitespace-nowrap">
          <AlertTriangle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className={compact ? "text-xs" : ""}>Too short</span>
        </div>
      );
    default:
      return null;
  }
}
