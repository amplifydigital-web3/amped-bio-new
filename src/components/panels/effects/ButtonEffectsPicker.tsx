import { cn } from '../../../utils/cn';

interface ButtonEffectsPickerProps {
  value: number;
  onChange: (effect: number) => void;
}

// TODO centralize list of effects, we should not have two different lists

const buttonEffects = [
  { id: 0, name: 'None', preview: '' },
  { id: 1, name: 'Scale', preview: 'hover:scale-105 transition-transform' },
  { id: 2, name: 'Glow', preview: 'hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-shadow' },
  { id: 3, name: 'Slide', preview: 'hover:translate-x-2 transition-transform' },
  { id: 4, name: 'Bounce', preview: 'hover:animate-bounce' },
  { id: 5, name: 'Pulse', preview: 'hover:animate-pulse' },
  { id: 6, name: 'Shake', preview: 'hover:animate-[wiggle_0.3s_ease-in-out]' },
  { id: 7, name: 'Rotate', preview: 'hover:rotate-3 transition-transform' },
  { id: 8, name: 'Pop', preview: 'hover:scale-110 active:scale-95 transition-transform' },
  { id: 9, name: 'Shine', preview: 'hover:before:opacity-100 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:opacity-0 before:transition-opacity overflow-hidden relative' },
];

export function ButtonEffectsPicker({ value, onChange }: ButtonEffectsPickerProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Button Hover Effects
      </label>
      <div className="grid grid-cols-2 gap-3">
        {buttonEffects.map((effect) => (
          <button
            key={effect.id}
            onClick={() => onChange(effect.id)}
            className={cn(
              'p-4 text-center bg-blue-500 text-white rounded-lg relative',
              effect.preview,
              value === effect.id && 'ring-2 ring-blue-600'
            )}
          >
            {effect.name}
          </button>
        ))}
      </div>
    </div>
  );
}