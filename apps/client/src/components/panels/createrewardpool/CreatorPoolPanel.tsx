import React, { useEffect, useRef } from "react";
import { useForm, useFieldArray, Controller, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount, useBalance, useChainId, usePublicClient } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import {
  Users,
  Gift,
  Trophy,
  Plus,
  Upload,
  Percent,
  Info,
  X,
  Save,
  Star,
  Crown,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { trpcClient } from "@/utils/trpc";
import { useCreatorPool } from "@/hooks/useCreatorPool";
import { PoolSummaryModal } from "./PoolSummaryModal";
import { TransactionModal } from "./TransactionModal";
import { PerksSection } from "./PerksSection";
import { creatorPoolSchema } from "./types";
import { type ContractFunctionExecutionError, decodeEventLog } from "viem";
import { CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";
import { CreatorPoolPanelSkeleton } from "./CreatorPoolPanelSkeleton";
import DashboardPage from "./PoolDashboardPage";

// Helper function to parse TRPC errors and extract user-friendly messages
const parseTRPCError = (error: unknown): string => {
  // Log the complete error for debugging
  console.error("Full error details:", error);

  if (error instanceof TRPCClientError) {
    // Handle the specific error format you mentioned
    // This will specifically extract "exceeds block gas limit" from the JSON structure
    if (error.message.includes("exceeds block gas limit")) {
      // Try multiple approaches to extract the message
      // Approach 1: Look for the specific pattern with "exceeds block gas limit"
      const gasLimitMatch = error.message.match(
        /"message"\s*:\s*"([^"]*exceeds block gas limit[^"]*)"/i
      );
      if (gasLimitMatch && gasLimitMatch[1]) {
        return `Transaction failed: ${gasLimitMatch[1]}`;
      }

      // Approach 2: More general message extraction
      const anyMessageMatch = error.message.match(/"message"\s*:\s*"([^"]+)"/);
      if (anyMessageMatch && anyMessageMatch[1]) {
        return `Transaction failed: ${anyMessageMatch[1]}`;
      }

      // Approach 3: If the error message is very long, try to find a shorter meaningful part
      if (error.message.length > 200) {
        // Look for common error patterns
        const commonErrors = [
          "exceeds block gas limit",
          "failed to sign message",
          "insufficient funds",
          "transaction underpriced",
        ];

        for (const errorMsg of commonErrors) {
          if (error.message.includes(errorMsg)) {
            return `Transaction failed: ${errorMsg}`;
          }
        }
      }

      // Fallback
      return "Transaction failed: exceeds block gas limit. Please try again with a lower stake amount or contact support.";
    }

    // Handle transaction signature errors
    if (error.message.includes("Transaction Signature:")) {
      const signatureMatch = error.message.match(/Transaction Signature:\s*([^.]+)/i);
      if (signatureMatch && signatureMatch[1]) {
        return `Transaction failed: ${signatureMatch[1].trim()}`;
      }
    }

    // Handle contract revert errors with reason
    if (error.message.includes("reverted with the following reason")) {
      const reasonMatch = error.message.match(/reverted with the following reason:\s*([^.]+)/i);
      if (reasonMatch && reasonMatch[1]) {
        return reasonMatch[1].trim();
      }
    }

    // Handle other common contract errors
    if (error.message.includes("failed to sign message")) {
      return "Transaction failed: unable to sign transaction. Please check your wallet connection and try again.";
    }

    // Handle generic TRPC errors - try to parse JSON errors
    if (error.message) {
      // Try to extract clean error message from JSON if it's a JSON string
      try {
        const errorObj = JSON.parse(error.message);
        if (errorObj.message) {
          return `Transaction failed: ${errorObj.message}`;
        }
      } catch {
        // If it's not JSON, return as is
        return error.message;
      }
      return error.message;
    }
  }

  // Handle other error types
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // Fallback for unknown errors
  return "An unknown error occurred. Please try again.";
};

import type { CreatorPoolFormValues, TierIconEntry } from "./types";

export function CreatorPoolPanel() {
  const isFirstRender = useRef(true);
  const client = usePublicClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { createPool, poolAddress, isLoading: isPoolLoading } = useCreatorPool();
  const [hasConfirmedPool, setHasConfirmedPool] = React.useState(false);
  const [showSummaryModal, setShowSummaryModal] = React.useState(false);
  const [formData, setFormData] = React.useState<CreatorPoolFormValues | null>(null);
  const [isLaunching, setIsLaunching] = React.useState(false);
  const [showTransactionModal, setShowTransactionModal] = React.useState(false);
  const [transactionStep, setTransactionStep] = React.useState<
    "confirming" | "confirmed" | "error"
  >("confirming");
  const [transactionHash, setTransactionHash] = React.useState<string | null>(null);
  const [transactionError, setTransactionError] = React.useState<string | null>(null);
  const [poolImage, setPoolImage] = React.useState<string | null>(null);

  // Effect to confirm pool existence when panel opens and user has a pool address but hasn't confirmed it
  useEffect(() => {
    const confirmExistingPool = async () => {
      // Only run if we have a pool address, it's not already confirmed, and we haven't tried to confirm it yet
      if (poolAddress && !isPoolLoading && !hasConfirmedPool) {
        try {
          // Call the confirmPoolCreation method to update the database
          await trpcClient.pools.creator.confirmPoolCreation.mutate({
            chainId: chainId.toString(),
          });

          setHasConfirmedPool(true);
          console.log("Pool confirmed successfully");
        } catch (error) {
          console.error("Error confirming pool:", error);

          // If confirmation fails, delete the pool from the database
          try {
            await trpcClient.pools.creator.deletePoolOnError.mutate({
              chainId: chainId.toString(),
            });
            console.log("Pool deleted due to confirmation error");
          } catch (deleteError) {
            console.error("Error deleting pool:", deleteError);
          }

          const errorMessage = parseTRPCError(error);
          toast.error(`Failed to confirm pool: ${errorMessage}`);
        }
      }
    };

    // Only run on first render and when there's no existing data
    if (isFirstRender.current) {
      confirmExistingPool();
      isFirstRender.current = false;
    }
  }, [poolAddress, isPoolLoading, chainId, hasConfirmedPool]);

  const { data: revoBalance } = useBalance({
    address,
  });

  const [uploadedFileId, setUploadedFileId] = React.useState<number | null>(null);

  const INITIAL_STAKE_ETH = 0.0015; // 1e15 wei

  const methods = useForm<CreatorPoolFormValues>({
    resolver: zodResolver(creatorPoolSchema),
    defaultValues: {
      poolName: "",
      poolDescription: "",
      initialStake: INITIAL_STAKE_ETH, // Use the constant
      creatorFee: 5,
      stakingTiers: [], // Start with empty array
    },
    mode: "onChange",
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = methods;

  const {
    fields: stakingTiers,
    append: appendTier,
    remove: removeTier,
  } = useFieldArray({
    control,
    name: "stakingTiers",
  });

  const creatorFee = watch("creatorFee");

  // Check if user has sufficient balance for the fixed initial stake
  const hasSufficientBalance =
    revoBalance && INITIAL_STAKE_ETH > 0
      ? INITIAL_STAKE_ETH <= Number(revoBalance.formatted)
      : true;
  const showInsufficientBalanceWarning =
    INITIAL_STAKE_ETH > 0 && revoBalance && !hasSufficientBalance;

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const presignedUrlData = await trpcClient.pools.creator.requestPoolImagePresignedUrl.mutate(
          {
            contentType: file.type,
            fileExtension: file.name.split(".").pop() || "",
            fileSize: file.size,
          }
        );

        const { presignedUrl, fileId } = presignedUrlData;

        await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        await trpcClient.pools.creator.confirmPoolImageUpload.mutate({
          fileId,
          fileName: file.name,
        });

        // Set the uploaded file ID in state
        setUploadedFileId(fileId);

        // Update the form value to show the image preview
        const reader = new FileReader();
        reader.onload = () => {
          if (e.target?.result && typeof e.target.result === "string") {
            setPoolImage(e.target.result);
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error uploading image:", error);
        const errorMessage = parseTRPCError(error);
        toast.error(`Failed to upload image: ${errorMessage}`);
      }
    }
  };

  const addTier = () => {
    appendTier({
      id: Date.now().toString(),
      name: "New Tier",
      minStake: 0,
      perks: [], // Start with empty array instead of default perk
      color: "bg-blue-100 text-blue-700",
    });
  };

  // Perks functionality has been moved to the PerksSection component

  const onSubmit = async (data: CreatorPoolFormValues) => {
    // Store form data and show summary modal instead of directly creating the pool
    setFormData(data);
    setShowSummaryModal(true);
  };

  const handleLaunchPool = async () => {
    if (!formData) return;

    setIsLaunching(true);
    setShowSummaryModal(false);
    setShowTransactionModal(true);
    setTransactionStep("confirming");
    setTransactionError(null);
    let createdPoolId: number | null = null;

    try {
      // First create the pool in the database
      const createdPool = await trpcClient.pools.creator.create.mutate({
        description: formData.poolDescription,
        chainId: chainId.toString(), // Pass chainId as string
      });

      createdPoolId = createdPool.id;

      try {
        // Then create the pool on the contract
        const hash = await createPool({
          poolName: formData.poolName,
          creatorCut: formData.creatorFee,
          stake: INITIAL_STAKE_ETH, // Fixed initial stake (1e15 wei)
        });

        // Set transaction hash for display
        setTransactionHash(hash);
        // wait for confirmation
        const res = await client!.waitForTransactionReceipt({ hash, confirmations: 2 });

        console.info("Transaction:", res);

        if (res.status == "reverted") {
          let errorMessage = "Transaction reverted";
          console.log("Transaction reverted. Inspecting logs:", res.logs);
          for (const log of res.logs) {
            try {
              const decodedLog = decodeEventLog({
                abi: CREATOR_POOL_FACTORY_ABI,
                data: log.data,
                topics: log.topics,
              });
              console.log("Decoded Log from receipt:", decodedLog);
              // Assuming the event name can be used as an error message
              errorMessage = decodedLog.eventName ?? "Unknown error";
            } catch {
              // ignore
            }
          }
          toast.error(`Transaction failed: ${errorMessage}`);
          setTransactionError(errorMessage);
          setTransactionStep("error");
          return;
        }
      } catch (createPoolError) {
        const e = createPoolError as ContractFunctionExecutionError;
        const message = e.cause.message ?? e.message;
        console.error("Error creating pool on contract:", createPoolError);

        if (message.includes("exceeds block gas limit")) {
          toast.error("Transaction failed: Exceeds block gas limit");
          setTransactionError("Transaction failed: Exceeds block gas limit");
        } else if (message.includes("insufficient funds for gas + value")) {
          toast.error("Transaction failed: Insufficient funds for gas + value");
          setTransactionError("Transaction failed: Insufficient funds for gas + value");
        } else {
          toast.error(message);
          setTransactionError(message);
        }
        setTransactionStep("error");

        return;
      }

      // After the contract pool is created, confirm it in the database
      await trpcClient.pools.creator.confirmPoolCreation.mutate({
        chainId: chainId.toString(), // Pass chainId as string
      });

      // Set the image for the pool if one was uploaded
      if (uploadedFileId) {
        await trpcClient.pools.creator.setImageForPool.mutate({
          id: createdPool.id,
          image_file_id: uploadedFileId,
        });
        toast.success("Pool image set successfully!");
      }

      // Move to confirmed step
      setTransactionStep("confirmed");
      toast.success("Pool created successfully!");
    } catch (error) {
      console.error("Error creating pool - Full error details:", error);

      // If we created a pool in the database but failed later, delete it
      if (createdPoolId) {
        try {
          await trpcClient.pools.creator.deletePoolOnError.mutate({
            chainId: chainId.toString(),
          });
          console.log("Pool deleted due to error");
        } catch (deleteError) {
          console.error("Error deleting pool:", deleteError);
        }
      }

      const errorMessage = parseTRPCError(error);
      setTransactionError(errorMessage);
      setTransactionStep("error");
      toast.error(`Failed to create pool: ${errorMessage}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const tierIcons: TierIconEntry[] = [
    { icon: Star, color: "text-orange-600" },
    { icon: Crown, color: "text-gray-600" },
    { icon: Trophy, color: "text-yellow-600" },
    { icon: Zap, color: "text-purple-600" },
    { icon: Gift, color: "text-pink-600" },
  ];

  if (!isConnected || isPoolLoading) {
    return <CreatorPoolPanelSkeleton />;
  }

  // If we've loaded and the user already has a pool, show the dashboard
  if (poolAddress) {
    return <DashboardPage />;
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Your Reward Pool</h1>
            <p className="text-gray-600">
              Set up a reward pool to engage your community and earn from their stakes
            </p>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Pool Details</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pool Name</label>
                <input
                  type="text"
                  {...register("poolName")}
                  placeholder="Enter your pool name (e.g., 'Creator's VIP Club')"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.poolName && (
                  <p className="text-red-500 text-sm mt-1">{errors.poolName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pool Description
                </label>
                <textarea
                  {...register("poolDescription")}
                  placeholder="Describe your pool and what supporters can expect..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                {errors.poolDescription && (
                  <p className="text-red-500 text-sm mt-1">{errors.poolDescription.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Help potential supporters understand the value of joining your pool
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Upload className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Pool Image</h3>
              </div>

              <div className="flex items-center space-x-6">
                <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                  {poolImage ? (
                    <img
                      src={poolImage}
                      alt="Pool preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Upload Image</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium cursor-pointer transition-colors duration-200">
                    <Upload className="w-4 h-4" />
                    <span>Choose Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">Recommended: 400x400px, max 5MB</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Percent className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Creator Fee</h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                      Percentage you earn from user stakes
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Fee Percentage</span>
                  <span className="text-lg font-semibold text-gray-900">{creatorFee}%</span>
                </div>

                <Controller
                  name="creatorFee"
                  control={control}
                  render={({ field }) => (
                    <div className="relative">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Trophy className="w-5 h-5 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Staking Tiers</h3>
                  <div className="group relative">
                    <Info className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                        Set rewards based on stake amounts
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addTier}
                  disabled
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Tier</span>
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Note: Staking tiers are not yet functional, but soon you'll be able to add exclusive
                perks for different tiers.
              </p>

              <div className="space-y-4">
                {stakingTiers.map((tier, index) => {
                  const IconComponent = tierIcons[index % tierIcons.length]?.icon || Star;
                  const iconColor = tierIcons[index % tierIcons.length]?.color || "text-gray-600";

                  return (
                    <div key={tier.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`p-2 rounded-lg ${tier.color.replace("text-", "bg-").replace("-700", "-100")}`}
                          >
                            <IconComponent className={`w-4 h-4 ${iconColor}`} />
                          </div>
                          <input
                            type="text"
                            {...register(`stakingTiers.${index}.name`)}
                            className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors duration-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {errors.stakingTiers?.[index]?.name && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.stakingTiers[index].name.message}
                        </p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Minimum Stake
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              {...register(`stakingTiers.${index}.minStake`, {
                                valueAsNumber: true,
                              })}
                              className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                              REVO
                            </div>
                          </div>
                          {errors.stakingTiers?.[index]?.minStake && (
                            <p className="text-red-500 text-sm mt-1">
                              {errors.stakingTiers[index].minStake.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <PerksSection tierIndex={index} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-center pt-6">
              <button
                type="submit"
                disabled={!isValid || showInsufficientBalanceWarning}
                className={`flex items-center space-x-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                  isValid && !showInsufficientBalanceWarning
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                <Save className="w-5 h-5" />
                <span>Create Reward Pool</span>
              </button>
            </div>
          </div>

          <style>{`
            .slider::-webkit-slider-thumb {
              appearance: none;
              height: 20px;
              width: 20px;
              border-radius: 50%;
              background: #3B82F6;
              cursor: pointer;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            
            .slider::-moz-range-thumb {
              height: 20px;
              width: 20px;
              border-radius: 50%;
              background: #3B82F6;
              cursor: pointer;
              border: none;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
          `}</style>
        </div>
      </form>

      <PoolSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        formData={formData!}
        onLaunch={handleLaunchPool}
        isLaunching={isLaunching}
        poolImage={poolImage}
      />

      <TransactionModal
        isOpen={showTransactionModal}
        onClose={() => {
          setShowTransactionModal(false);
          if (transactionStep === "confirmed" && formData) {
            // Handle successful pool creation
            console.log("Pool launched successfully:", {
              poolName: formData.poolName,
              poolDescription: formData.poolDescription,
              initialStake: formData.initialStake,
              creatorFee: formData.creatorFee,
              stakingTiers: formData.stakingTiers,
              transactionHash,
            });
          }
        }}
        transactionStep={transactionStep}
        transactionHash={transactionHash}
        poolName={formData?.poolName}
        creatorFee={formData?.creatorFee}
        errorMessage={transactionError || undefined}
      />
    </FormProvider>
  );
}
