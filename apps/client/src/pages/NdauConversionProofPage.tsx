import { useState } from "react";
import { useParams } from "react-router";
import { trpc } from "@/utils/trpc/trpc";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Wallet,
  Clock,
  FileText,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export default function NdauConversionProofPage() {
  const params = useParams<{ ndauAddress: string }>();
  const ndauAddressParam = params.ndauAddress;

  const { data: conversion, isLoading } = useQuery(
    trpc.ndauConversion.getConversion.queryOptions(
      { ndauAddress: ndauAddressParam },
      { enabled: !!ndauAddressParam }
    );

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboardSafe = async (text: string | undefined, fieldName: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const truncateAddress = (address?: string) => {
    if (!address) return "-";
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const truncateSignature = (sig?: string) => {
    if (!sig) return "-";
    return `${sig.slice(0, 15)}...${sig.slice(-10)}`;
  };

  if (!ndauAddressParam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Missing NDAU Address
              </h1>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-300">
              No NDAU address provided. Please provide an NDAU address in the URL.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-300 mt-4">
              Loading conversion proof...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!conversion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Conversion Not Found
              </h1>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-300">
              No conversion found for NDAU address: {ndauAddressParam}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            NDAU to REVO Conversion Proof
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Cryptographically verifiable proof of conversion agreement
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-8">
          {/* Status Card */}
          <div
            className={`p-6 rounded-lg border-2 ${
              conversion.status === "processed"
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : conversion.status === "pending"
                  ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                  : "border-gray-500 bg-gray-50 dark:bg-gray-700"
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              {conversion.status === "processed" ? (
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
              ) : conversion.status === "pending" ? (
                <Clock className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <AlertCircle className="h-10 w-10 text-gray-600 dark:text-gray-400" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Status: {conversion.status.charAt(0).toUpperCase() + conversion.status.slice(1)}
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {conversion.status === "processed"
                    ? "Conversion has been completed and REVO tokens have been sent"
                    : conversion.status === "pending"
                      ? "Conversion is awaiting admin processing"
                      : "Unknown conversion status"}
                </p>
              </div>
            </div>
          </div>

          {/* Conversion Details */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Conversion Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">NDAU Address:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded font-mono text-gray-900 dark:text-white break-all">
                      {conversion.ndauAddress}
                    </code>
                    <Button
                      onClick={() => copyToClipboardSafe(conversion.ndauAddress, "ndauAddress")}
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">REVO Address:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded font-mono text-gray-900 dark:text-white break-all">
                      {conversion.revoAddress}
                    </code>
                    <Button
                      onClick={() => copyToClipboardSafe(conversion.revoAddress, "revoAddress")}
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">NDAU Amount:</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {parseFloat(conversion.ndauAmount).toFixed(6)} NDAU
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">REVO Amount:</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {conversion.revoAmount} REVO
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Submitted On:</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {new Date(conversion.createdAt).toLocaleString()}
                  </p>
                </div>

                {conversion.updatedAt && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Last Updated:</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {new Date(conversion.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {conversion.txid && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Transaction Hash:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded font-mono text-blue-600 dark:text-blue-400 break-all">
                        {conversion.txid}
                      </code>
                      <Button
                        onClick={() => copyToClipboardSafe(conversion.txid, "txid")}
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Signatures Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              Cryptographic Signatures
            </h3>

            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  AmpedBio Wallet Signature:
                </p>
                <div className="flex items-start gap-2">
                  <code
                    className="flex-1 text-xs bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-900 dark:text-white break-all"
                    title={conversion.ampedbioSignature}
                  >
                    {truncateSignature(conversion.ampedbioSignature)}
                  </code>
                  <Button
                    onClick={() =>
                      copyToClipboardSafe(conversion.ampedbioSignature, "ampedbioSignature")
                    }
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  This signature proves the AmpedBio wallet owner agreed to the conversion.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  NDAU Wallet Signature:
                </p>
                <div className="flex items-start gap-2">
                  <code
                    className="flex-1 text-xs bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-900 dark:text-white break-all"
                    title={conversion.ndauSignature}
                  >
                    {truncateSignature(conversion.ndauSignature)}
                  </code>
                  <Button
                    onClick={() => copyToClipboardSafe(conversion.ndauSignature, "ndauSignature")}
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  This signature proves the NDAU wallet owner agreed to the conversion.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Verification:</strong> You can verify these signatures by checking that
                  they were created by the respective wallet addresses shown above.
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-semibold">
                    Important Information
                  </p>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                    <li>This proof serves as immutable evidence of the conversion agreement</li>
                    <li>All data is cryptographically signed and verifiable on-chain</li>
                    <li>The backend fetched the actual NDAU balance at submission time</li>
                    <li>Keep this proof for your records in case of any disputes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="text-center">
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="inline-flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Back to Conversion Page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
