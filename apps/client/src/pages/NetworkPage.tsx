import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { AVAILABLE_CHAINS } from "@ampedbio/web3";
import { Button } from "../components/ui/Button";
import { Wallet } from "lucide-react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
      on: (event: string, handler: (arg: unknown) => void) => void;
      removeListener: (event: string, handler: (arg: unknown) => void) => void;
    };
  }
}

const NetworkPage: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({
            method: "eth_accounts",
          });
          if ((accounts as string[]).length > 0) {
            setIsConnected(true);
            setWalletAddress((accounts as string[])[0]);
          }
        } catch (error) {
          console.error("Error checking connection:", error);
        }
      }
    };

    checkConnection();

    const handleAccountsChanged = (arg: unknown) => {
      const accounts = arg as string[];
      if (accounts.length > 0) {
        setIsConnected(true);
        setWalletAddress(accounts[0]);
      } else {
        setIsConnected(false);
        setWalletAddress(null);
      }
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, []);

  const connectMetaMask = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask not installed");
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if ((accounts as string[]).length > 0) {
        setIsConnected(true);
        setWalletAddress((accounts as string[])[0]);
        toast.success("MetaMask connected successfully!");
      }
    } catch (error) {
      console.error("Failed to connect:", error);
      toast.error("Failed to connect to MetaMask");
    } finally {
      setIsConnecting(false);
    }
  };

  const addNetworkToMetaMask = async (chain: (typeof AVAILABLE_CHAINS)[number]) => {
    if (!window.ethereum) {
      toast.error("MetaMask not installed");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${chain.id.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: {
              name: chain.nativeCurrency.name,
              symbol: chain.nativeCurrency.symbol,
              decimals: chain.nativeCurrency.decimals,
            },
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: [chain.blockExplorers.default.url],
          },
        ],
      });
      toast.success("Network added successfully!");
    } catch (error) {
      console.error("Failed to add network:", error);
      toast.error("Failed to add network");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Networks</h1>
        <p className="text-gray-600">
          Configure your wallet to interact with RevolutionChain networks
        </p>
      </div>

      {isConnected ? (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-green-600" />
            <span className="text-green-800 font-medium">
              Connected: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            <span className="text-blue-800 font-medium">Connect your wallet to add networks</span>
          </div>
          <Button onClick={connectMetaMask} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect MetaMask"}
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Network
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Chain ID
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                RPC URL
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Currency
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Explorer
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {AVAILABLE_CHAINS.map(chain => (
              <tr key={chain.id} className="hover:bg-gray-50">
                <td className="py-4 px-6">
                  <div className="font-medium text-gray-900">{chain.name}</div>
                  <div className="text-sm text-gray-500">{chain.network}</div>
                </td>
                <td className="py-4 px-6 text-gray-700">{chain.id}</td>
                <td className="py-4 px-6 text-gray-700 text-sm font-mono">
                  {chain.rpcUrls.default.http[0]}
                </td>
                <td className="py-4 px-6 text-gray-700">
                  <div>{chain.nativeCurrency.symbol}</div>
                  <div className="text-sm text-gray-500">
                    {chain.nativeCurrency.decimals} decimals
                  </div>
                </td>
                <td className="py-4 px-6">
                  <a
                    href={chain.blockExplorers.default.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View
                  </a>
                </td>
                <td className="py-4 px-6">
                  <Button
                    onClick={() => addNetworkToMetaMask(chain)}
                    size="sm"
                    disabled={!isConnected}
                  >
                    Add to MetaMask
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NetworkPage;
