interface HeroEffectPickerProps {
  value: number;
  onChange: (effect: number) => void;
}

const heroEffects = [
  { id: 0, name: "None", description: "No text effect" },
  // { id: 1, name: "Gradient", description: "Animated gradient text" }, is not working properly
  { id: 2, name: "Glow", description: "Soft glowing text" },
  // { id: 3, name: "Typewriter", description: "Typing animation" }, is not working properly
  // { id: 4, name: "Fade In", description: "Smooth fade in" }, is not working properly
  // { id: 5, name: "Slide Up", description: "Slide up animation" }, is not working properly
  { id: 6, name: "Wave", description: "Wavy text effect" },
  { id: 7, name: "Neon", description: "Neon light effect" },
  { id: 8, name: "Rainbow", description: "Rainbow color cycle" },
  { id: 9, name: "Glitch", description: "Cyberpunk glitch effect" },
];

export function HeroEffectPicker({ value, onChange }: HeroEffectPickerProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">Hero Name Effect</label>
      <div className="grid grid-cols-2 gap-3">
        {heroEffects.map(effect => (
          <button
            key={effect.id}
            onClick={() => onChange(effect.id)}
            className={`p-4 text-left rounded-lg border transition-all ${
              value === effect.id
                ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500"
                : "bg-white border-gray-200 hover:border-blue-200"
            }`}
          >
            <p className="font-medium text-gray-900">{effect.name}</p>
            <p className="text-sm text-gray-500 mt-1">{effect.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
