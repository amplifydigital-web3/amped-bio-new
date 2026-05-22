import { FC, useState } from "react";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import { useChainId } from "wagmi";
import { getCurrencySymbol, libertasTestnet } from "@ampedbio/web3";
import { NDAU_GROUP_LABELS } from "@ampedbio/constants";
import { createWalletClient, custom, parseEther, type Address } from "viem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Download,
  Wallet,
  ClipboardCheck,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RouterOutputs } from "@/utils/trpc/trpc";
import { formatHandle } from "@/utils/handle";

export const AdminNdauConversions: FC = () => {
  const chainId = useChainId();
  const currencySymbol = getCurrencySymbol(chainId);
  const {
    data: conversions,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(trpc.ndauConversion.getAllConversions.queryOptions());

  const queryClient = useQueryClient();

  const [showFullData, setShowFullData] = useState(false);

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied!");
  };

  const [selectedConversion, setSelectedConversion] = useState<
    RouterOutputs["ndauConversion"]["getAllConversions"][number] | null
  >(null);
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);

  const [isConnectingMetaMask, setIsConnectingMetaMask] = useState(false);
  const [isMetaMaskConnected, setIsMetaMaskConnected] = useState(false);
  const [metaMaskAddress, setMetaMaskAddress] = useState<string | null>(null);
  const [isSendingTx, setIsSendingTx] = useState(false);

  const [isMarkCompletedOpen, setIsMarkCompletedOpen] = useState(false);
  const [txidInput, setTxidInput] = useState("");
  const [selectedConversionForMark, setSelectedConversionForMark] = useState<
    RouterOutputs["ndauConversion"]["getAllConversions"][number] | null
  >(null);

  const confirmMutation = useMutation({
    mutationFn: trpc.ndauConversion.confirmConversionTxid.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success(`Conversion confirmed! TXID recorded.`);
      setIsProcessDialogOpen(false);
      setSelectedConversion(null);
      setIsMetaMaskConnected(false);
      setMetaMaskAddress(null);
      refetch();
    },
    onError: err => {
      toast.error(`Failed to confirm conversion: ${err.message}`);
    },
  });

  const markCompletedMutation = useMutation({
    mutationFn: trpc.ndauConversion.markConversionCompleted.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion marked as completed!");
      setIsMarkCompletedOpen(false);
      setSelectedConversionForMark(null);
      setTxidInput("");
      refetch();
    },
    onError: err => {
      toast.error(`Failed to mark conversion: ${err.message}`);
    },
  });

  const connectMetaMask = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask is not installed");
      return;
    }

    setIsConnectingMetaMask(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts.length > 0) {
        setIsMetaMaskConnected(true);
        setMetaMaskAddress(accounts[0]);
        toast.success("MetaMask connected");
      }
    } catch (error) {
      console.error("Failed to connect to MetaMask:", error);
      toast.error("Failed to connect to MetaMask");
    } finally {
      setIsConnectingMetaMask(false);
    }
  };

  const handleProcessClick = async (
    conversion: RouterOutputs["ndauConversion"]["getAllConversions"][number]
  ) => {
    try {
      const latest = await queryClient.fetchQuery(
        trpc.ndauConversion.getConversionById.queryOptions({ id: conversion.id })
      );
      if (latest.txid || latest.status !== "pending") {
        toast.error(
          latest.status === "processing"
            ? "This conversion is currently being processed"
            : "This conversion has already been processed"
        );
        return;
      }
    } catch (err) {
      toast.error(
        `Failed to check conversion status: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      return;
    }

    setSelectedConversion(conversion);
    setIsMetaMaskConnected(false);
    setMetaMaskAddress(null);
    setIsProcessDialogOpen(true);
  };

  const handleMetaMaskSend = async () => {
    if (!selectedConversion || !window.ethereum) return;

    setIsSendingTx(true);
    try {
      const walletClient = createWalletClient({
        chain: libertasTestnet,
        transport: custom(window.ethereum),
      });

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const hash = await walletClient.sendTransaction({
        account: accounts[0] as Address,
        chain: libertasTestnet,
        to: selectedConversion.revoAddress as Address,
        value: parseEther(selectedConversion.revoAmount),
      });

      toast.success("Transaction submitted. Recording TXID...");

      confirmMutation.mutate({
        id: selectedConversion.id,
        txid: hash,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("User rejected")) {
        toast.error("Transaction rejected by MetaMask");
      } else {
        console.error("Transaction failed:", error);
        toast.error(`Transaction failed: ${message}`);
      }
    } finally {
      setIsSendingTx(false);
    }
  };

  const handleMarkCompletedClick = (
    conversion: RouterOutputs["ndauConversion"]["getAllConversions"][number]
  ) => {
    setSelectedConversionForMark(conversion);
    setTxidInput("");
    setIsMarkCompletedOpen(true);
  };

  const handleMarkCompletedSubmit = () => {
    if (!selectedConversionForMark || !txidInput.trim()) return;

    markCompletedMutation.mutate({
      id: selectedConversionForMark.id,
      txid: txidInput.trim(),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case "processed":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Processed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const escapeCSV = (str: string | number | null | undefined) => {
    if (str === null || str === undefined) return "";
    const string = String(str);
    if (string.includes('"')) return `"${string.replace(/"/g, '""')}"`;
    if (string.includes(",")) return `"${string}"`;
    return string;
  };

  const exportCSV = () => {
    if (!conversions || conversions.length === 0) return;

    const headers = [
      "ID",
      "NDAU Address",
      "Group",
      "NDAU Amount",
      `${currencySymbol} Amount`,
      `${currencySymbol} Address`,
      "Ampedbio User",
      "AmpedBio Signature",
      "NDAU Signature",
      "Status",
      "TXID",
      "Created At",
      "Updated At",
    ];

    const rows = conversions.map(c =>
      [
        c.id,
        escapeCSV(c.ndauAddress),
        escapeCSV(c.group),
        c.ndauAmount,
        c.revoAmount,
        escapeCSV(c.revoAddress),
        escapeCSV(c.user?.handle ?? null),
        escapeCSV(c.ampedbioSignature ?? null),
        escapeCSV(c.ndauSignature ?? null),
        escapeCSV(c.status),
        escapeCSV(c.txid ?? null),
        escapeCSV(new Date(c.createdAt).toLocaleDateString()),
        escapeCSV(c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : ""),
      ].join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `ndau-conversions-${today}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">NDAU Conversions</h1>
        <p>Loading conversions...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">NDAU Conversions</h1>
        <p className="text-red-500">Error loading conversions: {error?.message}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">NDAU to {currencySymbol} Conversions</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            Total: {conversions?.length || 0}
          </Badge>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {conversions && conversions.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="flex items-center gap-2 mb-4">
            <Switch checked={showFullData} onChange={() => setShowFullData(prev => !prev)} />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show full data</span>
          </div>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  ID
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  NDAU Address
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Group
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  NDAU Amount
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  {currencySymbol} Amount
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  {currencySymbol} Address
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Ampedbio User
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  AmpedBio Signature
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  NDAU Signature
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  TXID
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Created At
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {conversions.map(conversion => (
                <tr key={conversion.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {conversion.id}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs cursor-pointer ${showFullData ? "" : "max-w-[150px] truncate"}`}
                    title={conversion.ndauAddress}
                    onClick={() => copyToClipboard(conversion.ndauAddress)}
                  >
                    {conversion.ndauAddress}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white capitalize">
                    {NDAU_GROUP_LABELS[conversion.group] || conversion.group}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-semibold">
                    {conversion.ndauAmount} NDAU
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-semibold">
                    {conversion.revoAmount} {currencySymbol}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs cursor-pointer ${showFullData ? "" : "max-w-[150px] truncate"}`}
                    title={conversion.revoAddress}
                    onClick={() => copyToClipboard(conversion.revoAddress)}
                  >
                    {conversion.revoAddress}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {conversion.user?.handle ? (
                      <a
                        href={`/${formatHandle(conversion.user.handle)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {formatHandle(conversion.user.handle)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs cursor-pointer ${showFullData ? "" : "max-w-[120px] truncate"}`}
                    title={conversion.ampedbioSignature}
                    onClick={() => copyToClipboard(conversion.ampedbioSignature || "")}
                  >
                    {conversion.ampedbioSignature
                      ? showFullData
                        ? conversion.ampedbioSignature
                        : `${conversion.ampedbioSignature.slice(0, 10)}...`
                      : "-"}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs cursor-pointer ${showFullData ? "" : "max-w-[120px] truncate"}`}
                    title={conversion.ndauSignature}
                    onClick={() => copyToClipboard(conversion.ndauSignature || "")}
                  >
                    {conversion.ndauSignature
                      ? showFullData
                        ? conversion.ndauSignature
                        : `${conversion.ndauSignature.slice(0, 10)}...`
                      : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(conversion.status)}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs cursor-pointer ${showFullData ? "" : "max-w-[150px] truncate"}`}
                    title={conversion.txid || ""}
                    onClick={() => conversion.txid && copyToClipboard(conversion.txid)}
                  >
                    {conversion.txid ? (
                      <a
                        href={`https://libertas.revoscan.io/tx/${conversion.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {conversion.txid}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(conversion.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {conversion.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleProcessClick(conversion)}>
                          Process
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkCompletedClick(conversion)}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          Mark Completed
                        </Button>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No conversion requests found.</p>
        </div>
      )}

      {/* Process Dialog */}
      <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Conversion via MetaMask</DialogTitle>
          </DialogHeader>

          {selectedConversion && (
            <div className="space-y-4 py-4">
              {!window.ethereum ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">
                    MetaMask is not installed. Please install MetaMask to process conversions.
                  </p>
                </div>
              ) : !isMetaMaskConnected ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">NDAU Amount:</span>
                      <span className="font-semibold text-gray-900">
                        {selectedConversion.ndauAmount} NDAU
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">{currencySymbol} to send:</span>
                      <span className="font-semibold text-blue-600">
                        {selectedConversion.revoAmount} REVO
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">{currencySymbol} Address:</span>
                      <span className="font-mono text-xs text-gray-900 break-all max-w-[200px]">
                        {selectedConversion.revoAddress}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={connectMetaMask}
                    disabled={isConnectingMetaMask}
                    className="w-full"
                  >
                    {isConnectingMetaMask ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4 mr-2" />
                        Connect MetaMask
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-800 font-medium">
                        Connected: {metaMaskAddress?.slice(0, 6)}...{metaMaskAddress?.slice(-4)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 mb-2">
                      <strong>Confirm Transaction:</strong> MetaMask will prompt you to send:
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                      <li>{selectedConversion.revoAmount} REVO</li>
                      <li>To: {selectedConversion.revoAddress}</li>
                      <li>On: Libertas Testnet</li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">From:</span>
                      <span className="font-mono text-xs text-gray-900 break-all max-w-[200px]">
                        {metaMaskAddress}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">To:</span>
                      <span className="font-mono text-xs text-gray-900 break-all max-w-[200px]">
                        {selectedConversion.revoAddress}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Amount:</span>
                      <span className="font-semibold text-blue-600">
                        {selectedConversion.revoAmount} REVO
                      </span>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsProcessDialogOpen(false)}
                      disabled={isSendingTx || confirmMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleMetaMaskSend}
                      disabled={isSendingTx || confirmMutation.isPending}
                      variant="confirm"
                    >
                      {isSendingTx ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : confirmMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send {currencySymbol}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark Completed Dialog */}
      <Dialog open={isMarkCompletedOpen} onOpenChange={setIsMarkCompletedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Conversion as Completed</DialogTitle>
          </DialogHeader>

          {selectedConversionForMark && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">NDAU Amount:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedConversionForMark.ndauAmount} NDAU
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{currencySymbol} Amount:</span>
                  <span className="font-semibold text-blue-600">
                    {selectedConversionForMark.revoAmount} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{currencySymbol} Address:</span>
                  <span className="font-mono text-xs text-gray-900 break-all max-w-[200px]">
                    {selectedConversionForMark.revoAddress}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txid-input">Transaction ID (TXID)</Label>
                <Input
                  id="txid-input"
                  placeholder="0x..."
                  value={txidInput}
                  onChange={e => setTxidInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-gray-500">
                  Enter the transaction hash of the REVO transfer. The system will validate the
                  transaction on-chain before marking it as completed.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsMarkCompletedOpen(false);
                    setSelectedConversionForMark(null);
                    setTxidInput("");
                  }}
                  disabled={markCompletedMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleMarkCompletedSubmit}
                  disabled={!txidInput.trim() || markCompletedMutation.isPending}
                  variant="confirm"
                >
                  {markCompletedMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Mark Completed
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
