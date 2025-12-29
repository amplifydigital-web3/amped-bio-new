import { Copy, ExternalLink } from "lucide-react";
import { nftIdToBytes32, scannerURL, trimmedDomainName } from "@/utils/rns";
import { getChainConfig } from "@ampedbio/web3";
import { useChainId } from "wagmi";

interface ProfileMoreDetailsProps {
  name: string;
  resolver: `0x${string}` | undefined;
  nftId: bigint;
}

const MoreDetails = ({ name, resolver, nftId }: ProfileMoreDetailsProps) => {
  const hexData = nftIdToBytes32(nftId);
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);

  return (
    <div className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8 space-y-4">
      {/* Token Card */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold mb-0">Token</h2>
          <a
            href={scannerURL("nft", `${networkConfig?.contracts.BASE_REGISTRAR.address}/${nftId}`)}
            target="_blank"
            className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium"
          >
            Explorer <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-6">
          <div className="space-y-4">
            {/* Hex Value */}
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-4 break-all">
                <span className="text-gray-500 font-semibold w-32 mb-2 sm:mb-0">hex</span>
                <span className="text-sm pr-2 font-semibold">{hexData}</span>
                <Copy
                  onClick={() => navigator.clipboard.writeText(hexData)}
                  className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-2 flex-shrink-0"
                />
              </div>
            </div>

            {/* Decimal Value */}
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-4 break-all">
                <span className="text-gray-500 font-semibold w-40 mb-2 sm:mb-0">decimal</span>
                <p className="text-sm pr-2 font-semibold">{nftId.toString()}</p>
                <Copy
                  onClick={() => navigator.clipboard.writeText(String(nftId))}
                  className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-2 flex-shrink-0"
                />
              </div>
            </div>
          </div>

          {/* ENS Logo Box */}
          <div className="w-full max-w-xs bg-blue-500 rounded-lg flex flex-col items-center justify-center text-white p-2 mx-0 sm:mx-auto sm:p-4">
            <div className="mb-2">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 sm:w-8 sm:h-8"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs sm:text-sm">{trimmedDomainName(name)}</span>
          </div>
        </div>
      </div>
      {/* Resolver Card */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold mb-0">Resolver</h2>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 sm:gap-0">
            <span className="break-all font-semibold">{resolver}</span>
            <Copy
              onClick={() => navigator.clipboard.writeText(resolver as string)}
              className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoreDetails;
