import { AlertTriangle } from "lucide-react";
import type { MarketplaceTheme } from "../../../types/editor";
import { HoverPopover } from "../../ui/popover";
import { trpc } from "../../../utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { useEditor } from "../../../contexts/EditorContext";

interface ThemeCardProps {
  theme: MarketplaceTheme;
  onApply: (theme: MarketplaceTheme["theme"]) => void;
}

export function ThemeCard({ theme, onApply }: ThemeCardProps) {
  const { profile, setUser } = useEditor();

  // Mutation for applying theme
  const applyTheme = useMutation({
    ...trpc.theme.applyTheme.mutationOptions(),
    onSuccess: async data => {
      toast.success(`${data.themeName} applied successfully!`);
      // Also apply the theme config to the editor
      onApply(theme.theme);

      // Refetch the current user data to get the updated theme in the store
      if (profile?.onelink) {
        await setUser(profile.onelink);
      }
    },
    onError: error => {
      toast.error(`Failed to apply theme: ${error.message}`);
    },
  });

  const handleApply = async () => {
    // Check if this is a server theme (user_id === null) and should use tRPC
    const isServerTheme = theme.user_id === null;

    if (isServerTheme) {
      // Use tRPC to apply marketplace theme to user
      const themeId = parseInt(theme.id);
      if (!isNaN(themeId)) {
        applyTheme.mutate({ themeId });
        return;
      }
    }

    try {
      const response = await fetch(`/themes/${theme.name.replace(" ", "_")}.ampedtheme`);
      if (!response.ok) {
        throw new Error(`Failed to fetch theme: ${response.status}`);
      }
      const themeData = await response.json();

      // For hardcoded themes, use themeId = 0 and pass the theme data
      applyTheme.mutate({
        themeId: 0,
        theme: {
          name: theme.name,
          description: theme.description || "",
          share_level: "public",
          share_config: {},
          config: themeData,
        },
      });

      // Also apply immediately to editor
      onApply(themeData);
    } catch (error) {
      console.error("Error fetching theme data:", error);
      // Fallback to using the theme data we already have
      onApply(theme.theme);
    }
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition-colors group">
      <div className="aspect-video relative overflow-hidden">
        <img src={theme.thumbnail} alt={theme.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={handleApply}
            disabled={applyTheme.isPending}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{applyTheme.isPending ? "Applying..." : "Apply Theme"}</span>
          </button>
        </div>
        {theme.user_id === null && (
          <div className="absolute top-2 left-2 bg-orange-500/90 px-2 py-1 rounded-full flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-white" />
            <span className="text-xs text-white">Not Customizable</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-medium text-gray-900 truncate">{theme.name}</h3>
        <HoverPopover
          trigger={
            <p className="text-sm text-gray-500 line-clamp-2 mt-1 cursor-help">
              {theme.description}
            </p>
          }
          side="top"
          align="start"
          className="w-80"
        >
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900">{theme.name}</h4>
            <p className="text-sm text-gray-600">{theme.description}</p>
          </div>
        </HoverPopover>
      </div>
    </div>
  );
}
