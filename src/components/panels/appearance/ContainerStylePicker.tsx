import CollapsiblePanelWrapper from "../CollapsiblePanelWrapper";
import { ColorPicker } from "./ColorPicker";

interface ContainerStylePickerProps {
  value: number;
  transparency: number;
  containerColor: string;
  onChange: (style: number) => void;
  onTransparencyChange: (transparency: number) => void;
  onColorChange: (color: string) => void;
}

const containerStyles = [
  { id: 0, name: "None", preview: "" },
  {
    id: 1,
    name: "Frosted Glass",
    preview: "bg-white/70 backdrop-blur-md rounded-2xl shadow-lg",
  },
  {
    id: 2,
    name: "Floating Card",
    preview:
      "bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] transition-shadow",
  },
  {
    id: 3,
    name: "Gradient Border",
    preview: "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl",
  },
  {
    id: 4,
    name: "Neon Glow",
    preview: "bg-white rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.5)]",
  },
  {
    id: 5,
    name: "Double Border",
    preview:
      "bg-white rounded-2xl border-2 border-gray-200 outline outline-2 outline-offset-2 outline-gray-100",
  },
  {
    id: 6,
    name: "Morphic",
    preview:
      "bg-white/90 rounded-[2.5rem] shadow-[inset_0_0_30px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.1)]",
  },
  {
    id: 7,
    name: "Minimal Glass",
    preview: "bg-white/50 backdrop-blur-sm rounded-xl border border-white/20",
  },
  {
    id: 8,
    name: "Soft Depth",
    preview:
      "relative before:absolute before:inset-x-0 before:top-0 before:-translate-y-[calc(100%-2rem)] before:h-24 before:bg-white/90 before:[border-radius:187.5px_187.5px_0_0] before:-z-10 bg-white/90 rounded-3xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.05)] backdrop-blur-sm",
  },
  {
    id: 9,
    name: "Modern Card",
    preview: "bg-white rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.2)]",
  },
];

export function ContainerStylePicker({
  value,
  transparency,
  containerColor,
  onChange,
  onTransparencyChange,
  onColorChange,
}: ContainerStylePickerProps) {
  return (
    <CollapsiblePanelWrapper title="Container Style">
      <div className="space-y-6">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Container Style</label>
          <div className="grid grid-cols-2 gap-3">
            {containerStyles.map(style => (
              <button
                key={style.id}
                onClick={() => onChange(style.id)}
                className={`p-4 text-center ${style.preview} ${
                  value === style.id ? "ring-2 ring-blue-500" : "hover:ring-2 hover:ring-gray-200"
                } transition-all duration-200`}
              >
                {style.name}
              </button>
            ))}
          </div>
        </div>

        <ColorPicker label="Container Color" value={containerColor} onChange={onColorChange} />

        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Container Transparency</label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min={0}
              max={100}
              value={transparency}
              onChange={e => onTransparencyChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm text-gray-600 min-w-[3ch]">{transparency}%</span>
          </div>
        </div>
      </div>
    </CollapsiblePanelWrapper>
  );
}
