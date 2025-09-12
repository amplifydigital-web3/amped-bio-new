import { useFormContext, useWatch } from "react-hook-form";
import { Target, X } from "lucide-react";
import type { CreatorPoolFormValues } from "./types";

interface PerksSectionProps {
  tierIndex: number;
}

export function PerksSection({ tierIndex }: PerksSectionProps) {
  const { register, control, setValue } = useFormContext<CreatorPoolFormValues>();

  const perks =
    useWatch({
      control,
      name: `stakingTiers.${tierIndex}.perks`,
    }) || [];

  const addPerkToTier = () => {
    setValue(`stakingTiers.${tierIndex}.perks`, [...perks, "New perk"]);
  };

  const removePerk = (perkIndex: number) => {
    setValue(
      `stakingTiers.${tierIndex}.perks`,
      perks.filter((_, index) => index !== perkIndex)
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">Perks & Benefits</label>
        <button
          type="button"
          onClick={addPerkToTier}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add Perk
        </button>
      </div>
      <div className="space-y-2">
        {perks.map((_, perkIndex) => (
          <div key={perkIndex} className="flex items-center space-x-2">
            <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              {...register(`stakingTiers.${tierIndex}.perks.${perkIndex}`)}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {perks.length > 1 && (
              <button
                type="button"
                onClick={() => removePerk(perkIndex)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors duration-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
