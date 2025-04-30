import { ButtonEffectsPicker } from "./ButtonEffectsPicker";
import { ParticlesEffectPicker } from "./ParticlesEffectPicker";
import { HeroEffectPicker } from "./HeroEffectPicker";
import { useEditorStore } from "../../../store/editorStore";

export function EffectsPanel() {
  const theme = useEditorStore(state => state.theme.config);
  const updateThemeConfig = useEditorStore(state => state.updateThemeConfig);

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Effects</h2>
        <p className="text-sm text-gray-500">
          Add animations and interactive effects to your profile
        </p>
      </div>

      <ButtonEffectsPicker
        value={theme.buttonEffect}
        onChange={effect => updateThemeConfig({ buttonEffect: effect })}
      />

      <ParticlesEffectPicker
        value={theme.particlesEffect}
        onChange={effect => updateThemeConfig({ particlesEffect: effect })}
      />

      <HeroEffectPicker
        value={theme.heroEffect}
        onChange={effect => updateThemeConfig({ heroEffect: effect })}
      />
    </div>
  );
}
