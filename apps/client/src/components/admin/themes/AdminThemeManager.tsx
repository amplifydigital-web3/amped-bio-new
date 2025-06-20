import { useState } from "react";
import { trpc } from "../../../utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { Plus, List, Eye, Grid } from "lucide-react";
import { CreateThemeTab } from "./CreateThemeTab";
import { CreateCategoryTab } from "./CreateCategoryTab";
import { ViewCategoriesTab } from "./ViewCategoriesTab";
import { ViewThemesTab } from "./ViewThemesTab";

export function AdminThemeManager() {
  const [activeTab, setActiveTab] = useState<"themes" | "categories" | "view-categories" | "view-themes">("themes");

  // Queries
  const { refetch: refetchCategories } = useQuery(
    trpc.admin.themes.getThemeCategories.queryOptions()
  );

  return (
    <div className="flex flex-col bg-gray-50">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("themes")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "themes"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Plus className="h-4 w-4 inline mr-2" />
              Create Theme
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "categories"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <List className="h-4 w-4 inline mr-2" />
              Create Category
            </button>
            <button
              onClick={() => setActiveTab("view-categories")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "view-categories"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              View Categories
            </button>
            <button
              onClick={() => setActiveTab("view-themes")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "view-themes"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Grid className="h-4 w-4 inline mr-2" />
              View Admin Themes
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            
            {/* Theme Creation Tab */}
            {activeTab === "themes" && (
              <CreateThemeTab />
            )}

            {/* Category Management Tab */}
            {activeTab === "categories" && (
              <CreateCategoryTab
                refetchCategories={refetchCategories}
              />
            )}

            {/* View Categories Tab */}
            {activeTab === "view-categories" && (
              <ViewCategoriesTab
                refetchCategories={refetchCategories}
              />
            )}

            {/* View Themes Tab */}
            {activeTab === "view-themes" && (
              <ViewThemesTab />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
