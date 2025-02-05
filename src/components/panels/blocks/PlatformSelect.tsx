import { platforms } from '../../../utils/platforms';

interface PlatformSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function PlatformSelect({ value, onChange }: PlatformSelectProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        Platform
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        required
      >
        <option value="">Select a platform</option>
        {platforms.map((platform) => (
          <option key={platform.id} value={platform.id}>
            {platform.name}
          </option>
        ))}
      </select>
    </div>
  );
}