import { FC, useState } from "react";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, XCircle, Send } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RouterOutputs } from "@/utils/trpc/trpc";

export const AdminNdauConversions: FC = () => {
  const {
    data: conversions,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(trpc.ndauConversion.getAllConversions.queryOptions());

  const [selectedConversion, setSelectedConversion] = useState<RouterOutputs["ndauConversion"]["getAllConversions"][number] | null>(null);
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);

  const processMutation = useMutation({
    mutationFn: trpc.ndauConversion.processConversion.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Conversion processed successfully! REVO tokens sent.");
      setIsProcessDialogOpen(false);
      setSelectedConversion(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to process conversion: ${err.message}`);
    },
  });

  const handleProcessClick = (conversion: RouterOutputs["ndauConversion"]["getAllConversions"][number]) => {
    setSelectedConversion({
      id: conversion.id,
      ndauAddress: conversion.ndauAddress,
      ndauAmount: conversion.ndauAmount,
      revoAmount: conversion.revoAmount,
      revoAddress: conversion.revoAddress,
    });
    setIsProcessDialogOpen(true);
  };

  const handleSubmitProcess = () => {
    if (!selectedConversion) return;

    processMutation.mutate({
      id: selectedConversion.id,
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
        <h1 className="text-2xl font-bold">NDAU to REVO Conversions</h1>
        <Badge variant="outline" className="text-sm">
          Total: {conversions?.length || 0}
        </Badge>
      </div>

      {conversions && conversions.length > 0 ? (
        <div className="overflow-x-auto">
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
                  NDAU Amount
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  REVO Amount
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  REVO Address
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
              {conversions.map((conversion) => (
                <tr key={conversion.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {conversion.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs max-w-[150px] truncate">
                    {conversion.ndauAddress}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-semibold">
                    {conversion.ndauAmount} NDAU
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-semibold">
                    {conversion.revoAmount} REVO
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs max-w-[150px] truncate">
                    {conversion.revoAddress}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(conversion.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs max-w-[150px] truncate">
                    {conversion.txid || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(conversion.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {conversion.status === "pending" ? (
                      <Button
                        size="sm"
                        onClick={() => handleProcessClick(conversion)}
                        disabled={processMutation.isPending}
                      >
                        Process
                      </Button>
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
            <DialogTitle>Send REVO Tokens</DialogTitle>
          </DialogHeader>

          {selectedConversion && (
            <>
              <div className="space-y-4 py-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                    <strong>Confirmation:</strong> By clicking "Send REVO", you confirm that:
                  </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                    <li>You have verified the NDAU conversion request</li>
                    <li>The NDAU tokens have been received</li>
                    <li>You authorize the automatic transfer of REVO tokens</li>
                  </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      NDAU Amount:
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedConversion.ndauAmount} NDAU
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      REVO to send:
                    </span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {selectedConversion.revoAmount} REVO
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      REVO Address:
                    </span>
                    <span className="font-mono text-xs text-gray-900 dark:text-white break-all max-w-[200px]">
                      {selectedConversion.revoAddress}
                    </span>
                  </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Note:</strong> The transaction will be sent automatically to the user's
                    REVO address. Make sure you have sufficient balance.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsProcessDialogOpen(false)}
                  disabled={processMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmitProcess}
                  disabled={processMutation.isPending}
                  variant="confirm"
                >
                  {processMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send REVO
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
