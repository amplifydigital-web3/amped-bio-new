import React, { useState } from "react";
import { useThemeManagement } from "../../hooks/useThemeManagement";
import { AlertCircle, Plus, Trash2, Edit, Eye } from "lucide-react";
import { Button } from "../ui/button";

interface ThemeManagerProps {
  onThemeSelect?: (themeId: number) => void;
}

export function ThemeManager({ onThemeSelect }: ThemeManagerProps) {
  const {
    userThemes,
    isLoadingThemes,
    themesError,
    editTheme,
    deleteTheme,
    isEditingTheme,
    isDeletingTheme,
  } = useThemeManagement();

  const [editingTheme, setEditingTheme] = useState<any>(null);
  const [newTheme, setNewTheme] = useState({
    name: "",
    share_level: "private",
    share_config: {},
    config: {},
  });

  const handleCreateTheme = () => {
    editTheme({
      id: 0, // 0 indicates creation of new theme
      theme: newTheme,
    });
    setNewTheme({
      name: "",
      share_level: "private", 
      share_config: {},
      config: {},
    });
  };

  const handleEditTheme = (theme: any) => {
    editTheme({
      id: theme.id,
      theme: {
        name: theme.name,
        share_level: theme.share_level,
        share_config: theme.share_config,
        config: theme.config,
      },
    });
    setEditingTheme(null);
  };

  const handleDeleteTheme = (themeId: number) => {
    if (window.confirm("Are you sure you want to delete this theme?")) {
      deleteTheme({ id: themeId });
    }
  };

  if (isLoadingThemes) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (themesError) {
    return (
      <div className="flex items-center p-4 text-red-800 bg-red-50 rounded-lg">
        <AlertCircle className="w-5 h-5 mr-2" />
        <span>Error loading themes: {themesError.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Themes</h3>
        <Button onClick={() => setEditingTheme({ id: 0, ...newTheme })} className="flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Create Theme
        </Button>
      </div>

      {/* Create/Edit Theme Form */}
      {editingTheme && (
        <div className="p-4 bg-gray-50 rounded-lg border">
          <h4 className="font-medium mb-4">
            {editingTheme.id === 0 ? "Create New Theme" : "Edit Theme"}
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Theme Name
              </label>
              <input
                type="text"
                value={editingTheme.name}
                onChange={(e) =>
                  setEditingTheme({ ...editingTheme, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter theme name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Share Level
              </label>
              <select
                value={editingTheme.share_level}
                onChange={(e) =>
                  setEditingTheme({ ...editingTheme, share_level: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="flex space-x-3">
              <Button
                onClick={() =>
                  editingTheme.id === 0 ? handleCreateTheme() : handleEditTheme(editingTheme)
                }
                disabled={isEditingTheme || !editingTheme.name}
              >
                {isEditingTheme ? "Saving..." : editingTheme.id === 0 ? "Create" : "Update"}
              </Button>
              <Button variant="outline" onClick={() => setEditingTheme(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Themes List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userThemes?.map((theme) => (
          <div key={theme.id} className="p-4 bg-white border rounded-lg shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-gray-900">{theme.name}</h4>
              <div className="flex space-x-1">
                {onThemeSelect && (
                  <button
                    onClick={() => onThemeSelect(theme.id)}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Select theme"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setEditingTheme(theme)}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Edit theme"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteTheme(theme.id)}
                  disabled={isDeletingTheme}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete theme"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-2">
              Share Level: {theme.share_level}
            </div>
            {theme.config && (
              <div className="text-xs text-gray-400">
                Last updated: {new Date(theme.updated_at).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {userThemes?.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No themes found. Create your first theme!</p>
        </div>
      )}
    </div>
  );
}
