import React from 'react';
import { ColorPicker } from './ColorPicker';

interface FontPickerProps {
  font: string;
  size: string;
  color: string;
  onFontChange: (font: string) => void;
  onSizeChange: (size: string) => void;
  onColorChange: (color: string) => void;
}

const fonts = [
  { name: 'Inter', value: 'Inter' },
  { name: 'Roboto', value: 'Roboto' },
  { name: 'Open Sans', value: 'Open Sans' },
  { name: 'Montserrat', value: 'Montserrat' },
  { name: 'Poppins', value: 'Poppins' },
];

const fontSizes = [
  { name: 'Small', value: '14px' },
  { name: 'Base', value: '16px' },
  { name: 'Medium', value: '18px' },
  { name: 'Large', value: '20px' },
  { name: 'Extra Large', value: '24px' },
];

export function FontPicker({
  font,
  size,
  color,
  onFontChange,
  onSizeChange,
  onColorChange,
}: FontPickerProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Font Family
        </label>
        <div className="grid grid-cols-1 gap-3">
          {fonts.map((f) => (
            <button
              key={f.value}
              onClick={() => onFontChange(f.value)}
              className={`p-3 text-left rounded-lg transition-all ${
                font === f.value
                  ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                  : 'bg-white hover:bg-gray-50 text-gray-900 ring-1 ring-gray-200'
              }`}
              style={{ fontFamily: f.value }}
            >
              <span className="text-base">{f.name}</span>
              <p className="mt-1 text-sm opacity-70">
                The quick brown fox jumps over the lazy dog
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Font Size
        </label>
        <div className="grid grid-cols-2 gap-3">
          {fontSizes.map((s) => (
            <button
              key={s.value}
              onClick={() => onSizeChange(s.value)}
              className={`p-3 text-center rounded-lg transition-all ${
                size === s.value
                  ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                  : 'bg-white hover:bg-gray-50 text-gray-900 ring-1 ring-gray-200'
              }`}
              style={{ fontSize: s.value }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <ColorPicker
        label="Font Color"
        value={color}
        onChange={onColorChange}
      />

      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">Preview</p>
        <p
          className="mt-2"
          style={{
            fontFamily: font,
            fontSize: size,
            color: color,
          }}
        >
          The quick brown fox jumps over the lazy dog
        </p>
      </div>
    </div>
  );
}