import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { Home } from "lucide-react";
import { useAccount } from "wagmi";

interface RNSHeaderProps {
  /** Render mobile variant (visible only on small screens) */
  mobile?: boolean;
}

export function RNSHeader({ mobile = false }: RNSHeaderProps) {
  const { navigateToHome, navigateToMyNames } = useRNSNavigation();
  const { address: ownerAddress } = useAccount();

  const containerClass = mobile
    ? "flex sm:hidden items-center gap-4"
    : "hidden sm:flex items-center gap-4";

  return (
    <div className={containerClass}>
      <button
        onClick={navigateToHome}
        className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
      >
        <Home className="w-4 h-4" />
        <span>RNS Home</span>
      </button>
      {ownerAddress && (
        <button
          onClick={navigateToMyNames}
          className="text-gray-700 hover:text-gray-900 font-medium"
        >
          My Names
        </button>
      )}
    </div>
  );
}

export default RNSHeader;
