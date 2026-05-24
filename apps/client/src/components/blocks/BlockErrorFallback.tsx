import { AlertTriangle } from "lucide-react";

interface BlockErrorFallbackProps {
  platform?: string;
}

export function BlockErrorFallback({ platform }: BlockErrorFallbackProps) {
  const message = platform
    ? `${platform.charAt(0).toUpperCase() + platform.slice(1)} block could not be loaded`
    : "This block could not be loaded";

  return (
    <div className="w-full p-6 rounded-lg bg-destructive/10 border-2 border-dashed border-destructive/20 flex flex-col items-center justify-center space-y-2">
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}
