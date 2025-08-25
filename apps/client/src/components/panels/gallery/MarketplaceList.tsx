import { ChevronRight, AlertTriangle } from "lucide-react";
import type { MarketplaceTheme } from "../../../types/editor";

interface MarketplaceListProps {
  themes: MarketplaceTheme[];
  onApply: (theme: any) => void;
}

export function MarketplaceList({ themes, onApply }: MarketplaceListProps) {
  return (
    <div className="space-y-4">
      {themes.map(theme => (
        <div
          key={theme.id}
          className="flex items-center space-x-4 bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
        >
          <div className="w-40 aspect-video rounded-lg overflow-hidden flex-shrink-0">
            <img src={theme.thumbnail} alt={theme.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-medium text-gray-900">{theme.name}</h3>
              {theme.user_id === null && (
                <div className="bg-orange-100 px-2 py-1 rounded-full flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3 text-orange-600" />
                  <span className="text-xs text-orange-700 font-medium">Not Customizable</span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{theme.description}</p>
          </div>
          <button
            onClick={() => onApply(theme.theme)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
          >
            <span>Apply</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
