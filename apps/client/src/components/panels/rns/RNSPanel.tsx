import React, { useState } from "react";
import { Search, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "../../ui/Input";

interface NameStatus {
  name: string;
  status: "available" | "taken" | "checking";
  expiryDate?: string;
  owner?: string;
}

export function RNSPanel() {
  const [searchTerm, setSearchTerm] = useState("");
  const [nameStatus, setNameStatus] = useState<NameStatus | null>(null);
  const [recentSearches, setRecentSearches] = useState<NameStatus[]>([
    {
      name: "revolution.revo",
      status: "taken",
      expiryDate: "2025-12-31",
      owner: "0x1234...5678",
    },
    {
      name: "web3.revo",
      status: "taken",
      expiryDate: "2024-06-15",
      owner: "0x8765...4321",
    },
    {
      name: "crypto.revo",
      status: "available",
    },
  ]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;

    // Simulate checking status
    setNameStatus({ name: searchTerm, status: "checking" });

    // Simulate API call
    setTimeout(() => {
      const status: NameStatus = {
        name: searchTerm,
        status: Math.random() > 0.5 ? "available" : "taken",
        ...(Math.random() > 0.5 && {
          expiryDate: "2024-12-31",
          owner: "0x1234...5678",
        }),
      };

      setNameStatus(status);
      setRecentSearches(prev => [status, ...prev.slice(0, 4)]);
    }, 1000);
  };

  const getStatusDisplay = (status: NameStatus) => {
    switch (status.status) {
      case "available":
        return (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span>Available</span>
          </div>
        );
      case "taken":
        return (
          <div className="flex items-center space-x-2 text-red-600">
            <XCircle className="w-5 h-5" />
            <span>Taken</span>
          </div>
        );
      case "checking":
        return (
          <div className="flex items-center space-x-2 text-blue-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Checking...</span>
          </div>
        );
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Revolution Name Service</h2>
        <p className="text-sm text-gray-500">
          Register your unique .revo name for your Web3 identity
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <Input
            label="Search for a name"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value.toLowerCase())}
            placeholder="Enter a name (e.g., revolution.revo)"
          />
          <button
            type="submit"
            className="absolute right-2 top-[30px] p-2 text-gray-400 hover:text-gray-600"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </form>

      {/* Search Result */}
      {nameStatus && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">{nameStatus.name}</h3>
            {getStatusDisplay(nameStatus)}
          </div>

          {nameStatus.status === "available" ? (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                This name is available for registration. Secure it now!
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Registration Cost</p>
                  <p className="text-lg font-medium text-gray-900">1,000 REVO</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Registration Period</p>
                  <p className="text-lg font-medium text-gray-900">1 Year</p>
                </div>
              </div>
              <button className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Register Name
              </button>
            </div>
          ) : nameStatus.status === "taken" && nameStatus.owner ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Owner</p>
                  <p className="text-sm font-medium text-gray-900">{nameStatus.owner}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Expiry Date</p>
                  <p className="text-sm font-medium text-gray-900">{nameStatus.expiryDate}</p>
                </div>
              </div>
              <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Make Offer
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Recent Searches */}
      <div>
        <div className="flex items-center space-x-2 mb-4">
          <Clock className="w-5 h-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700">Recent Searches</h3>
        </div>
        <div className="space-y-2">
          {recentSearches.map(search => (
            <div
              key={search.name}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              onClick={() => {
                setSearchTerm(search.name);
                setNameStatus(search);
              }}
            >
              <span className="text-sm font-medium text-gray-900">{search.name}</span>
              {getStatusDisplay(search)}
            </div>
          ))}
        </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">What is RNS?</h4>
          <p className="text-sm text-blue-700">
            Revolution Name Service provides unique, human-readable names for your Web3 identity and
            wallet addresses.
          </p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">Benefits</h4>
          <p className="text-sm text-green-700">
            Replace complex wallet addresses with a simple name, enhance your brand, and create a
            unified Web3 identity.
          </p>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg">
          <h4 className="font-medium text-purple-900 mb-2">Features</h4>
          <p className="text-sm text-purple-700">
            Secure registration, easy management, and seamless integration with Web3 applications
            and services.
          </p>
        </div>
      </div>
    </div>
  );
}
