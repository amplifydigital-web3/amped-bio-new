import React, { useState, useEffect } from "react";
import { Search, Check } from "lucide-react";
import { useReverseLookup } from "@/hooks/rns/useReverseLookup";
import { useNameAvailability } from "@/hooks/rns/useNameAvailability";
import { normalize } from "viem/ens";
import { isValidRevolutionName, domainName } from "@/utils/rns";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { SkeletonSearchResult } from "../ui/SkeletonLoader";
import { DOMAIN_SUFFIX } from "@/config/rns/constants";

export default function NameSearchForm() {
  const [value, setValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [isAddress, setIsAddress] = useState(false);
  const [isValidName, setIsValidName] = useState(true);
  const { navigateToAddress, navigateToRegister, navigateToProfile } = useRNSNavigation();

  const { name: resolvedName, isLoadingAddr: isLoadingAddr } = useReverseLookup(
    value as `0x${string}`
  );

  const { isAvailable, isLoading: isCheckingAvailability } = useNameAvailability(
    isAddress ? "" : debouncedValue
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isValidName || value === "") {
        setDebouncedValue(value);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [value, isValidName]);

  const checkIfAddress = (input: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/i.test(input);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value.toLowerCase();
    setValue(rawInput);
    setIsAddress(checkIfAddress(rawInput));

    try {
      if (rawInput && !isAddress) {
        if (isValidRevolutionName(rawInput)) {
          normalize(rawInput);
          setIsValidName(true);
        } else {
          setIsValidName(false);
        }
      } else {
        setIsValidName(rawInput !== "");
      }
    } catch {
      setIsValidName(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;

    if (isAddress) {
      if (resolvedName) {
        navigateToAddress(value);
      }
    } else if (!isValidName) {
      console.error("Cannot submit invalid name");
      return;
    } else {
      let cleanName = value;
      if (cleanName.endsWith(".eth")) {
        cleanName = cleanName.substring(0, cleanName.length - 4);
      }

      if (isAvailable) {
        navigateToRegister(cleanName);
      } else {
        navigateToProfile(cleanName);
      }
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 md:px-6 z-10">
      <div className="text-center relative">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-4 relative">
          <span className="block text-black">Secure your</span>
          <span
            className="block text-transparent bg-clip-text animate-gradient-shift"
            style={{
              backgroundSize: "200% 200%",
              backgroundImage:
                "linear-gradient(90deg, #2563eb 0%, #3b82f6 20%, #6366f1 40%, #4f46e5 60%, #7c3aed 80%, #9333ea 90%, #2563eb 100%)",
            }}
          >
            Revolution name
          </span>
        </h1>
        <p className="text-base md:text-lg text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
          Search, register, and manage your decentralized identity with the
          <span className="hidden sm:inline"> </span>
          <span className="sm:hidden">
            <br />
          </span>
          most trusted name service in Web3
        </p>
      </div>

      <div className="relative max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="relative rounded-2xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <div className="relative flex items-center gap-2 sm:gap-3 px-4 sm:px-5 md:px-6 py-3 sm:py-4">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                value={value}
                onChange={handleInputChange}
                placeholder="Search a name. Claim. Register."
                className="w-full bg-transparent border-none outline-none text-sm sm:text-base text-gray-700 placeholder-gray-400 font-normal"
              />
              <button
                type="submit"
                className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-600 text-white rounded-xl font-medium text-sm sm:text-base hover:bg-blue-700 transition-all duration-200 shrink-0"
              >
                Search
              </button>
            </div>
          </div>

          {value && isCheckingAvailability && (
            <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
              <SkeletonSearchResult animated={true} />
            </div>
          )}

          {value && !isCheckingAvailability && (
            <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
              <div
                onClick={handleSubmit}
                className="px-5 py-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-all duration-200 group"
              >
                {isAddress ? (
                  <>
                    <span className="text-gray-800 font-medium">{value}</span>
                    {isLoadingAddr ? (
                      <span className="text-sm text-gray-400 animate-pulse">Loading...</span>
                    ) : (
                      <span className="text-sm text-gray-400">
                        {resolvedName ? resolvedName : ""}
                      </span>
                    )}
                  </>
                ) : !isValidName ? (
                  <>
                    <span className="text-gray-800/50 font-medium truncate">
                      {domainName(value)}
                    </span>
                    <span className="text-sm text-yellow-500 font-medium">Invalid name</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium truncate">
                      <span className="text-blue-600">{value}</span>
                      <span className="text-gray-400">{DOMAIN_SUFFIX}</span>
                    </span>
                    {isAvailable ? (
                      <span className="text-sm text-emerald-500 font-medium flex items-center gap-2 shrink-0">
                        <Check className="w-4 h-4" />
                        Available
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 shrink-0">Registered</span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
