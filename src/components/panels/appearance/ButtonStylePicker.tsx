import CollapsiblePanelWrapper from '../CollapsiblePanelWrapper';
import { ColorPicker } from './ColorPicker';

interface ButtonStylePickerProps {
  color: string;
  style: number;

  onButtonStyleChange: (style: number) => void;
  onButtonColorChange: (color: string) => void;
}

const buttonStyles = [
  { id: 0, name: 'Default', preview: 'rounded-lg bg-gray-100' },
  { id: 1, name: 'Soft', preview: 'rounded-full bg-gray-100' },
  { id: 2, name: 'Outline', preview: 'rounded-lg border-2 border-gray-300' },
  { id: 3, name: 'Shadow', preview: 'rounded-lg bg-gray-100 shadow-lg' },
  { id: 4, name: 'Glass', preview: 'rounded-lg bg-white/30 backdrop-blur-sm' },
  // New styles
  {
    id: 5,
    name: 'Neon',
    preview:
      'rounded-lg bg-gray-100 shadow-[0_0_15px_rgba(0,0,0,0.2)] hover:shadow-[0_0_25px_rgba(0,0,0,0.3)] transition-shadow',
  },
  {
    id: 6,
    name: 'Gradient',
    preview: 'rounded-lg bg-gradient-to-r from-blue-500 to-purple-500',
  },
  {
    id: 7,
    name: 'Floating',
    preview:
      'rounded-lg bg-gray-100 hover:-translate-y-1 transition-transform shadow-md',
  },
  {
    id: 8,
    name: 'Bordered Glow',
    preview: 'rounded-lg bg-gray-100 ring-2 ring-offset-2 ring-blue-500',
  },
  {
    id: 9,
    name: 'Minimal',
    preview:
      'border-b-2 border-gray-300 hover:border-gray-400 transition-colors rounded-none bg-transparent',
  },
];

export function ButtonStylePicker({
  style: value,
  color,
  onButtonColorChange,
  onButtonStyleChange,
}: ButtonStylePickerProps) {
  return (
    <CollapsiblePanelWrapper title="Button Style">
      <div className="space-y-4 p-1">
        {/* <label className="block text-sm font-medium text-gray-700">
        Button Style
      </label> */}
        <div className="grid grid-cols-2 gap-3">
          {buttonStyles.map((style) => (
            <button
              key={style.id}
              onClick={() => onButtonStyleChange(style.id)}
              className={`p-4 text-center ${style.preview} ${value === style.id
                  ? 'ring-2 ring-blue-500'
                  : 'hover:ring-2 hover:ring-gray-200'
                }`}
            >
              {style.name}
            </button>
          ))}
        </div>
      </div>
      <div className='mt-3'>
        <ColorPicker
          label="Button Color"
          value={color}
          onChange={onButtonColorChange}

        />
      </div>
    </CollapsiblePanelWrapper>
  );
}
