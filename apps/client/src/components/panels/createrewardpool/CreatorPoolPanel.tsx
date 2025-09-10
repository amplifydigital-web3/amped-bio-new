import React, { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useBalance, useChainId } from "wagmi";
import {
  Users,
  Gift,
  Coins,
  Target,
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
  type LucideIcon,
} from "lucide-react";

import { trpc } from "@/utils/trpc";
import { useCreatorPool } from "@/hooks/useCreatorPool";

const stakingTierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Tier name is required"),
  minStake: z.number().min(0, "Minimum stake must be non-negative"),
  perks: z.array(z.string().min(1, "Perk description is required")),
  color: z.string(),
});

const creatorPoolSchema = z.object({
  poolName: z.string().min(1, "Pool name is required"),
  poolDescription: z.string().min(1, "Pool description is required"),
  poolImage: z.string().optional().nullable(),
  yourStake: z.number().min(0, "Your initial stake must be at least 0"),
  creatorFee: z.number().min(0).max(100),
  stakingTiers: z.array(stakingTierSchema),
});

type CreatorPoolFormValues = z.infer<typeof creatorPoolSchema>;
type StakingTier = z.infer<typeof stakingTierSchema>;

interface TierIconEntry {
  icon: LucideIcon;
  color: string;
}

export function CreatorPoolPanel() {
  const { address, isConnected } = useAccount();
  const { createPool, poolAddress, isConfirmed } = useCreatorPool();

  const createPoolMutation = useMutation(trpc.pools.create.mutationOptions());
  const updatePoolAddressMutation = useMutation(trpc.pools.confirmPoolCreation.mutationOptions());
  const requestPoolImagePresignedUrlMutation = useMutation(trpc.upload.requestPoolImagePresignedUrl.mutationOptions());
  const confirmPoolImageUploadMutation = useMutation(trpc.upload.confirmPoolImageUpload.mutationOptions());
  const setImageForPoolMutation = useMutation(trpc.pools.setImageForPool.mutationOptions());

  const chainId = useChainId();

  const { data: revoBalance } = useBalance({
    address,
  });

  const [createdPoolId, setCreatedPoolId] = React.useState<number | null>(null);
  const [uploadedFileId, setUploadedFileId] = React.useState<number | null>(null);

  const methods = useForm<CreatorPoolFormValues>({
    resolver: zodResolver(creatorPoolSchema),
    defaultValues: {
      poolName: "",
      poolDescription: "",
      poolImage: null,
      yourStake: 0,
      creatorFee: 5,
      stakingTiers: [],
    },
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
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

  const poolImage = watch("poolImage");
  const yourStake = watch("yourStake");
  const creatorFee = watch("creatorFee");
  const poolName = watch("poolName");
  const poolDescription = watch("poolDescription");
  const watchedStakingTiers = watch("stakingTiers");

  // Check if user has sufficient balance (only check if they're staking > 0)
  const hasSufficientBalance = revoBalance && yourStake > 0 ? yourStake <= Number(revoBalance.formatted) : true;
  const showInsufficientBalanceWarning = yourStake > 0 && revoBalance && !hasSufficientBalance;

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const presignedUrlData = await requestPoolImagePresignedUrlMutation.mutateAsync({
          contentType: file.type,
          fileExtension: file.name.split(".").pop() || "",
          fileSize: file.size,
        });

        const { presignedUrl, fileId } = presignedUrlData;

        await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        await confirmPoolImageUploadMutation.mutateAsync({
          fileId,
          fileName: file.name,
        });

        setUploadedFileId(fileId);

        const reader = new FileReader();
        reader.onload = e => {
          if (e.target?.result && typeof e.target.result === "string") {
            setValue("poolImage", e.target.result, { shouldValidate: true });
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error uploading image:", error);
      }
    }
  };

  const addTier = () => {
    appendTier({
      id: Date.now().toString(),
      name: "New Tier",
      minStake: 0,
      perks: ["Add your perks here"],
      color: "bg-blue-100 text-blue-700",
    });
  };

  const addPerkToTier = (tierIndex: number) => {
    const currentPerks = watch(`stakingTiers.${tierIndex}.perks`);
    setValue(`stakingTiers.${tierIndex}.perks`, [...currentPerks, "New perk"]);
  };

  const removePerk = (tierIndex: number, perkIndex: number) => {
    const currentPerks = watch(`stakingTiers.${tierIndex}.perks`);
    setValue(
      `stakingTiers.${tierIndex}.perks`,
      currentPerks.filter((_, index) => index !== perkIndex)
    );
  };

  const onSubmit = (data: CreatorPoolFormValues) => {
    createPoolMutation.mutate(
      {
        description: data.poolDescription,
        chainId: chainId.toString(), // Pass chainId as string
      },
      {
        onSuccess: (createdPool) => {
          setCreatedPoolId(createdPool.id);
          createPool({
            poolName: data.poolName,
            creatorCut: data.creatorFee,
            stake: data.yourStake,
          });
        },
      }
    );
  };

  useEffect(() => {
    if (isConfirmed && poolAddress && createdPoolId && chainId) {
      updatePoolAddressMutation.mutate(
        {
          chainId: chainId.toString(), // Pass chainId as string
        },
        {
          onSuccess: () => {
            if (uploadedFileId) {
              setImageForPoolMutation.mutate({
                id: createdPoolId,
                image_file_id: uploadedFileId,
              });
            }
          },
        }
      );
    }
  }, [isConfirmed, poolAddress, createdPoolId, updatePoolAddressMutation, chainId, uploadedFileId, setImageForPoolMutation]);

  const tierIcons: TierIconEntry[] = [
    { icon: Star, color: "text-orange-600" },
    { icon: Crown, color: "text-gray-600" },
    { icon: Trophy, color: "text-yellow-600" },
    { icon: Zap, color: "text-purple-600" },
    { icon: Gift, color: "text-pink-600" },
  ];

  // Skeleton loading component
  const renderSkeleton = () => (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
      </div>

      <div className="space-y-8">
        {/* Pool Details Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
              <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>

            <div>
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
              <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Pool Image Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="w-32 h-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div>
              <div className="h-10 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-40 mt-2 animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Your Initial Stake Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>

        {/* Creator Fee Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-10 animate-pulse"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
          </div>
        </div>

        {/* Staking Tiers Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-200 rounded-lg w-10 h-10 animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
          </div>

          <div className="h-4 bg-gray-200 rounded w-full mb-4 animate-pulse"></div>

          <div className="space-y-4">
            {[1, 2].map((item) => (
              <div key={item} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-200 rounded-lg w-8 h-8 animate-pulse"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                  </div>
                  <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2 animate-pulse"></div>
                    <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-8 bg-gray-200 rounded flex-1 animate-pulse"></div>
                      <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-8 bg-gray-200 rounded flex-1 animate-pulse"></div>
                      <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Button Skeleton */}
        <div className="flex justify-center pt-6">
          <div className="h-14 bg-gray-200 rounded-xl w-64 animate-pulse"></div>
        </div>
      </div>
    </div>
  );

  if (!isConnected) {
    return renderSkeleton();
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
                <div className="p-2 bg-green-100 rounded-lg">
                  <Coins className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Your Initial Stake</h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                      Amount you stake to bootstrap your pool (0 or more)
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  {...register("yourStake", { valueAsNumber: true })}
                  placeholder="0"
                  className="w-full px-4 py-3 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                  REVO
                </div>
              </div>
              {errors.yourStake && (
                <p className="text-red-500 text-sm mt-1">{errors.yourStake.message}</p>
              )}
              {revoBalance && (
                <div className="mt-2 text-sm text-gray-600">
                  Your balance: {Number(revoBalance.formatted).toFixed(2)} REVO
                </div>
              )}
              {showInsufficientBalanceWarning && (
                <div className="mt-2 text-sm text-red-600">
                  Insufficient balance. Please reduce your stake amount.
                </div>
              )}
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
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Tier</span>
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Note: Staking tiers are not yet functional, but soon you'll be able to add exclusive perks for different tiers.
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
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Perks & Benefits
                          </label>
                          <button
                            type="button"
                            onClick={() => addPerkToTier(index)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            + Add Perk
                          </button>
                        </div>
                        <div className="space-y-2">
                          {watch(`stakingTiers.${index}.perks`).map((_, perkIndex) => (
                            <div key={perkIndex} className="flex items-center space-x-2">
                              <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <input
                                type="text"
                                {...register(`stakingTiers.${index}.perks.${perkIndex}`)}
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              {watch(`stakingTiers.${index}.perks`).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePerk(index, perkIndex)}
                                  className="p-1 text-gray-400 hover:text-red-600 transition-colors duration-200"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
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
    </FormProvider>
  );
}
