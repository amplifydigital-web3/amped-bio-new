import React from "react";
import {
  Sparkles,
  X,
  Trophy,
  Percent,
  Target,
  Info,
  Check,
  Star,
  Crown,
  Zap,
  Gift,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface StakingTier {
  id: string;
  name: string;
  perks?: string[];
  color: string;
}

interface ModalCreatorPoolFormValues {
  poolName: string;
  poolDescription: string;
  initialStake: number;
  creatorFee: number;
  stakingTiers?: StakingTier[];
}

interface TierIconEntry {
  icon: LucideIcon;
  color: string;
}

interface PoolSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: ModalCreatorPoolFormValues;
  onLaunch: () => void;
  isLaunching: boolean;
  poolImage: string | null;
}

const tierIcons: TierIconEntry[] = [
  { icon: Star, color: "text-orange-600" },
  { icon: Crown, color: "text-gray-600" },
  { icon: Trophy, color: "text-yellow-600" },
  { icon: Zap, color: "text-purple-600" },
  { icon: Gift, color: "text-pink-600" },
];

export function PoolSummaryModal({
  isOpen,
  onClose,
  formData,
  onLaunch,
  isLaunching,
  poolImage,
}: PoolSummaryModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Sparkles className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">Pool Summary</DialogTitle>
                <p className="text-sm text-gray-600">Review your pool details before launching</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* Pool Overview */}
          <div className="flex items-center space-x-4 p-4 rounded-xl border border-blue-200">
            <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white shadow-sm bg-gray-100 flex-shrink-0">
              {poolImage ? (
                <img src={poolImage} alt="Pool preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-gray-500" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {formData.poolName || "Unnamed Pool"}
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                {formData.poolDescription || "No description provided"}
              </p>
              <p className="text-xs text-gray-500">Reward Pool</p>
              <div className="flex items-center space-x-4 mt-2 text-sm">
                <div className="flex items-center space-x-1">
                  <Percent className="w-4 h-4 text-orange-600" />
                  <span className="text-gray-700">Fee: {formData.creatorFee}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pool Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Creator Fee */}
            <div className="rounded-lg p-4 border border-orange-200">
              <div className="flex items-center space-x-2 mb-2">
                <Percent className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-700">Creator Fee</span>
              </div>
              <div className="text-2xl font-bold text-orange-900">{formData.creatorFee}%</div>
              <div className="text-xs text-orange-600 mt-1">Your earnings from stakes</div>
            </div>
          </div>

          {/* Staking Tiers */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-600" />
              <h4 className="text-lg font-semibold text-gray-900">Staking Tiers</h4>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                {formData.stakingTiers?.length || 0} tier
                {formData.stakingTiers && formData.stakingTiers.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3">
              {formData.stakingTiers?.map((tier, index) => {
                const IconComponent = tierIcons[index % tierIcons.length]?.icon || Star;
                const iconColor = tierIcons[index % tierIcons.length]?.color || "text-gray-600";

                return (
                  <div key={tier.id} className="rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2 rounded-lg ${tier.color.replace("text-", "bg-").replace("-700", "-100")}`}
                        >
                          <IconComponent className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <div>
                          <h5 className="font-semibold text-gray-900">{tier.name}</h5>
                          <p className="text-sm text-gray-600"></p>
                        </div>
                      </div>
                    </div>

                    <div className="ml-11">
                      <div className="text-sm text-gray-700">
                        <strong>Perks:</strong>
                      </div>
                      <ul className="text-sm text-gray-600 mt-1 space-y-1">
                        {tier.perks?.map((perk, perkIndex) => (
                          <li key={perkIndex} className="flex items-center space-x-2">
                            <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>{perk}</span>
                          </li>
                        )) || <li className="text-gray-500">No perks defined</li>}
                      </ul>
                    </div>
                  </div>
                );
              }) || <p className="text-gray-500 text-sm">No staking tiers defined</p>}
            </div>
          </div>

          {/* Launch Confirmation */}
          <div className="border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Ready to Launch</h4>
                <p className="text-sm text-blue-800">
                  Once launched, your pool will be live and users can start staking. You can modify
                  tiers and perks later, but the initial stake and creator fee cannot be changed.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-gray-200 bg-gray-50 p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
            >
              Back to Edit
            </button>

            <button
              onClick={onLaunch}
              disabled={isLaunching}
              className={`w-full sm:w-auto flex items-center justify-center space-x-3 px-8 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl ${
                isLaunching
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transform hover:scale-105"
              }`}
            >
              {isLaunching ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Launch Pool</span>
                </>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
