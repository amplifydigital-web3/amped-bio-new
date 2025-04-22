interface ParticlesEffectPickerProps {
  value: number;
  onChange: (effect: number) => void;
}

const particlesEffects = [
  { id: 0, name: "None", description: "No particles effect" },
  { id: 1, name: "Floating Dots", description: "Gentle floating particles" },
  { id: 2, name: "Connecting Lines", description: "Interactive connecting lines" },
  { id: 3, name: "Snow", description: "Falling snow effect" },
  { id: 4, name: "Bubbles", description: "Rising bubble particles" },
  { id: 5, name: "Fireflies", description: "Glowing firefly effect" },
  { id: 6, name: "Matrix", description: "Digital rain effect" },
  { id: 7, name: "Confetti", description: "Colorful confetti particles" },
  { id: 8, name: "Stars", description: "Twinkling stars effect" },
  { id: 9, name: "Geometric", description: "Connected geometric shapes" },
  // { id: 10, name: 'Custom', description: 'Custom Config' }
];

export function ParticlesEffectPicker({ value, onChange }: ParticlesEffectPickerProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">Background Particles Effect</label>
      <div className="grid grid-cols-2 gap-3">
        {particlesEffects.map(effect => (
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
