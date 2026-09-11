import { useState } from "react";
import { Copy, AlertTriangle, ChevronRight, SearchX, Inbox } from "lucide-react";
import { FaSpinner } from "react-icons/fa6";
import { format, fromUnixTime } from "date-fns";
import { isAddress } from "viem";
import { useReverseLookup } from "@/hooks/rns/useReverseLookup";
import useGetAllRegisteredNames from "@/hooks/rns/useGetAllRegisteredNames";
import { RevoName } from "@/types/rns/name";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";

interface AddressPageProps {
  address: string;
}

const AddressPage = ({ address: addressParam }: AddressPageProps) => {
  const { navigateToProfile, navigateToHome } = useRNSNavigation();

  const isValidAddress = Boolean(addressParam) && isAddress(addressParam);
  // The subgraph matches `owner` case-sensitively and stores it lowercased,
  // so normalize before any lookup.
  const address = (isValidAddress ? addressParam.toLowerCase() : "") as `0x${string}`;

  // Primary name (reverse record) — one address -> one display name.
  const { fullName } = useReverseLookup(address);

  // Active names owned by this address (expired names are excluded at the subgraph level).
  const { revoNames, isFetching, error } = useGetAllRegisteredNames(
    isValidAddress ? address : undefined,
    isValidAddress,
    true
  );

  const [searchQuery, setSearchQuery] = useState("");

  const formatExpiry = (expires?: string | null) => {
    // Subgraph values are typed `string` but not runtime-validated; a missing or
    // non-numeric expiry would make date-fns throw a RangeError while rendering.
    const timestamp = Number(expires);
    if (!expires || !Number.isFinite(timestamp)) return "Expiry unavailable";
    return `Expires on ${format(fromUnixTime(timestamp), "MMMM dd, yyyy")}`;
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    const start = addr.substring(0, 6);
    const end = addr.substring(addr.length - 3);
    return `${start}...${end}`;
  };

  const filteredNames = revoNames
    .filter((item: RevoName) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !item.name.toLowerCase().includes(query) &&
          !item.labelName.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      return true;
    })
    .sort(
      (a: RevoName, b: RevoName) => Number(b.expiryDateWithGrace) - Number(a.expiryDateWithGrace)
    );

  const heading = fullName || formatAddress(address);

  if (!isValidAddress) {
    return (
      <div className="w-full my-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-white shadow-sm border border-gray-100 px-6 sm:px-10 py-12 flex flex-col items-center text-center">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-24 w-24 rounded-full bg-red-100 opacity-60"></span>
            <div className="relative w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-9 h-9 text-red-500" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mt-6 text-gray-900">Invalid address</h1>
          <p className="text-gray-500 mt-2 max-w-md leading-relaxed">
            This doesn&apos;t look like a valid wallet address. Double-check the link and try again.
          </p>

          {addressParam && (
            <div className="mt-5 w-full max-w-md">
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                <SearchX className="w-4 h-4 text-gray-400 shrink-0" />
                <code className="text-sm text-gray-600 font-mono break-all text-left">
                  {addressParam}
                </code>
              </div>
            </div>
          )}

          <button
            onClick={() => navigateToHome()}
            className="mt-7 inline-flex items-center justify-center bg-blue-600 text-white px-7 py-2.5 rounded-full hover:bg-blue-700 transition font-medium shadow-sm"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full my-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
      {/* Profile Header Card */}
      <div className="rounded-3xl overflow-hidden bg-white shadow-sm">
        <div className="h-28 sm:h-36 bg-gradient-to-r from-indigo-400 via-indigo-400 to-blue-400 relative"></div>

        <div className="px-6 pb-6 relative pt-16">
          <div className="absolute left-6 sm:left-8 -top-16">
            <div className="w-32 h-32 rounded-full ring-8 ring-white bg-gradient-to-br from-green-300 to-green-100"></div>
          </div>
          <div className="flex justify-between items-start flex-col sm:flex-row gap-4">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-start gap-2 min-w-0">
                <h1 className="text-2xl font-bold break-all min-w-0">{heading}</h1>
                <button
                  className="text-gray-400 hover:text-gray-600 shrink-0 mt-1"
                  onClick={() => navigator.clipboard.writeText(fullName || address)}
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
              {fullName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-500 text-sm">{formatAddress(address)}</span>
                  <button
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => navigator.clipboard.writeText(address)}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {fullName && (
              <button
                onClick={() => navigateToProfile(fullName.split(".")[0])}
                className="shrink-0 bg-blue-50 text-blue-500 px-6 py-2 rounded-full hover:bg-blue-100 transition font-medium"
              >
                View Profile
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Names Card */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex justify-end p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search domains"
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg w-64"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {isFetching ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
            <FaSpinner className="animate-spin h-6 w-6" />
            <span className="text-sm">Getting names…</span>
          </div>
        ) : error ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <span className="text-sm">Something went wrong while fetching names.</span>
          </div>
        ) : filteredNames.length ? (
          <div className="divide-y divide-gray-100">
            {filteredNames.map(item => {
              const isPrimary = Boolean(fullName) && item.name === fullName;

              return (
                <button
                  key={item.name}
                  onClick={() => navigateToProfile(item.labelName)}
                  className="group w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition"
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-300 to-green-100 shrink-0"></div>
                  <div className="min-w-0 flex-1">
                    <span className="text-gray-900 font-semibold break-all">{item.name}</span>
                    <p className="text-sm text-gray-400">
                      {formatExpiry(item.expiryDateWithGrace)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isPrimary && (
                      <span className="px-3 py-1 bg-blue-50 text-blue-500 rounded-full text-xs font-medium">
                        Primary
                      </span>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : revoNames.length ? (
          // Names exist but were filtered out by the search query
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-center px-6">
            <SearchX className="h-8 w-8 text-gray-300" />
            <p className="text-gray-500 text-sm">
              {searchQuery ? `No domains found matching "${searchQuery}"` : "No domains found"}
            </p>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-center px-6">
            <Inbox className="h-8 w-8 text-gray-300" />
            <p className="text-gray-500 text-sm">This address doesn&apos;t own any active names.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddressPage;
