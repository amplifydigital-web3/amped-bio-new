import React from "react";
import { User } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { formatAddress } from "../utils";

interface RenderAddressProfileProps {
  address: Address;
  explorerUrl: string;
}

const RenderAddressProfile: React.FC<RenderAddressProfileProps> = ({ address, explorerUrl }) => {
  const { data } = useQuery(trpc.wallet.getUserByAddress.queryOptions({ address }));
  const currentUrl = window.location.origin;

  if (!data?.handle) {
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
    <Tooltip content={data.handle}>
      <a
        href={`${currentUrl}/@${data.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline cursor-pointer flex items-center"
      >
        {data.image ? (
          <img
            src={data.image}
            alt="User Avatar"
            className="w-6 h-6 rounded-full mr-2 object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-full mr-2 bg-gray-200 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-400" />
          </div>
        )}
        @{data.handle}
      </a>
    </Tooltip>
  );
};

export default RenderAddressProfile;
