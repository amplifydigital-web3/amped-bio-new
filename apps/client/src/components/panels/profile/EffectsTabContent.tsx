import { ButtonEffectsPicker } from "../effects/ButtonEffectsPicker";
import { ParticlesEffectPicker } from "../effects/ParticlesEffectPicker";
import { HeroEffectPicker } from "../effects/HeroEffectPicker";
import { useEditor } from "../../../contexts/EditorContext";
import { AlertTriangle } from "lucide-react";

export function EffectsTabContent() {
  const { theme, updateThemeConfig } = useEditor();
  const themeConfig = theme.config;

  // Check if theme is not customizable (admin theme)
  const isNotCustomizable = theme.user_id === null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Effects</h2>
        <p className="text-sm text-gray-500">
          Add animations and interactive effects to your profile
        </p>
      </div>

      {isNotCustomizable ? (
        <div className="flex items-center space-x-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-orange-800">Theme Not Customizable</h3>
            <p className="text-sm text-orange-700">
              This theme belongs to another user and cannot be customized. Choose a different theme
              to access effects options.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ButtonEffectsPicker
            value={themeConfig.buttonEffect ?? 1}
            onChange={effect => updateThemeConfig({ buttonEffect: effect })}
          />

          <ParticlesEffectPicker
            value={themeConfig.particlesEffect ?? 1}
            onChange={effect => updateThemeConfig({ particlesEffect: effect })}
          />

          <HeroEffectPicker
            value={themeConfig.heroEffect ?? 1}
            onChange={effect => updateThemeConfig({ heroEffect: effect })}
          />
        </>
      )}
    </div>
  );
}