import React, { useState } from "react";
import { useForm, useFieldArray, Controller, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  Check,
  Save,
  Sparkles,
  Star,
  Crown,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
  yourStake: z.number().min(1, "Your initial stake must be at least 1"),
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
  const { createPool, createPoolHash, createPoolError, isCreatingPool, isConfirming, isConfirmed } =
    useCreatorPool();

  // const [showSummaryModal, setShowSummaryModal] = useState(false);
  // const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionStep, setTransactionStep] = useState<"confirming" | "confirmed">("confirming");
  const [transactionHash, setTransactionHash] = useState("");

  const methods = useForm<CreatorPoolFormValues>({
    resolver: zodResolver(creatorPoolSchema),
    defaultValues: {
      poolName: "",
      poolDescription: "",
      poolImage: null,
      yourStake: 1000,
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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        if (e.target?.result && typeof e.target.result === "string") {
          setValue("poolImage", e.target.result, { shouldValidate: true });
        }
      };
      reader.readAsDataURL(file);
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

  const onSubmit = (data: CreatorPoolFormValues) =>
    createPool({
      poolName: data.poolName,
      creatorCut: data.creatorFee,
    });

  const handleLaunchPool = () => {
    // setShowSummaryModal(false);
    // setShowTransactionModal(true);
    // setTransactionStep("confirming");
    // const mockTxHash = "0x" + Math.random().toString(16).substr(2, 64);
    // setTransactionHash(mockTxHash);
    // setTimeout(() => {
    //   setTransactionStep("confirmed");
    // }, 3000);
  };

  const tierIcons: TierIconEntry[] = [
    { icon: Star, color: "text-orange-600" },
    { icon: Crown, color: "text-gray-600" },
    { icon: Trophy, color: "text-yellow-600" },
    { icon: Zap, color: "text-purple-600" },
    { icon: Gift, color: "text-pink-600" },
  ];

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
                      Amount you stake to bootstrap your pool
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  {...register("yourStake", { valueAsNumber: true })}
                  placeholder="1000"
                  className="w-full px-4 py-3 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                  REVO
                </div>
              </div>
              {errors.yourStake && (
                <p className="text-red-500 text-sm mt-1">{errors.yourStake.message}</p>
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
                disabled={!isValid}
                className={`flex items-center space-x-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                  isValid
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
