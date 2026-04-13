import React from "react";
import { User } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatAddress } from "../utils";
import { AddressProfile } from "../../hooks/useAddressProfiles";

interface RenderAddressProfileProps {
  address: string;
  explorerUrl: string;
  profile?: AddressProfile | null;
}

const RenderAddressProfile: React.FC<RenderAddressProfileProps> = React.memo(
  ({ address, explorerUrl, profile }) => {
    const currentUrl = window.location.origin;

    if (!profile?.handle) {
      return (
        <Tooltip content={address}>
          <a
            href={`${explorerUrl}/address/${address}#transactions`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline cursor-pointer"
          >
            {formatAddress(address)}
          </a>
        </Tooltip>
      );
    }

    return (
      <Tooltip content={profile.handle}>
        <a
          href={`${currentUrl}/@${profile.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline cursor-pointer flex items-center"
        >
          {profile.image ? (
            <img
              src={profile.image}
              alt="User Avatar"
              className="w-6 h-6 rounded-full mr-2 object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full mr-2 bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-400" />
            </div>
          )}
          @{profile.handle}
        </a>
      </Tooltip>
    );
  }
);

RenderAddressProfile.displayName = "RenderAddressProfile";

export default RenderAddressProfile;
