import { trpc } from "../../utils/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";
import { List, Image as ImageIcon, Eye, EyeOff } from "lucide-react";
import { CategoryImageUploader } from "./CategoryImageUploader";
import { Switch } from "../ui/Switch";

interface ViewCategoriesTabProps {
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  refetchCategories: () => void;
}

export function ViewCategoriesTab({ onError, onSuccess, refetchCategories }: ViewCategoriesTabProps) {
  // Queries
  const { data: categories } = useQuery(
    trpc.admin.themes.getThemeCategories.queryOptions()
  );

  // Mutations
  const toggleVisibilityMutation = useMutation(
    trpc.admin.themes.toggleThemeCategoryVisibility.mutationOptions()
  );

  const handleToggleVisibility = async (categoryId: number, visible: boolean, categoryTitle: string) => {
    try {
      await toggleVisibilityMutation.mutateAsync({
        id: categoryId,
        visible: visible
      });
      onSuccess(`Category "${categoryTitle}" is now ${visible ? 'visible' : 'hidden'}`);
      refetchCategories();
    } catch (error: any) {
      onError(`Failed to update visibility for "${categoryTitle}": ${error.message}`);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-2xl font-bold">Categories</h2>
        <p className="text-gray-600 mt-1">
          {categories?.length || 0} categories created
        </p>
      </div>
      
      <div className="p-6">
        {categories && categories.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="group p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200 bg-gray-50"
              >
                <div className="flex items-start space-x-4">
                  {/* Category Image */}
                  <div className="flex-shrink-0">
                    {category.image ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-gray-200 shadow-sm">
                        <img 
                          src={category.image} 
                          alt={category.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Category Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 text-sm truncate">{category.title}</h4>
                      <div className="flex items-center space-x-2">
                        {category.visible ? (
                          <Eye className="w-4 h-4 text-green-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                        <Switch
                          checked={category.visible}
                          onChange={(visible) => handleToggleVisibility(category.id, visible, category.title)}
                          disabled={toggleVisibilityMutation.isPending}
                          size="sm"
                        />
                      </div>
                    </div>
                    {category.description && (
                      <p className="text-xs text-gray-700 mt-1 italic break-words">"{category.description}"</p>
                    )}
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-600">Name: <span className="font-medium">{category.name}</span></p>
                      <p className="text-xs text-gray-600">ID: <span className="font-mono text-xs">{category.category}</span></p>
                      <p className="text-xs text-gray-500">
                        {category._count?.themes || 0} themes
                      </p>
                      <p className="text-xs text-gray-500">
                        Status: <span className={`font-medium ${category.visible ? 'text-green-600' : 'text-gray-500'}`}>
                          {category.visible ? 'Visible' : 'Hidden'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Image Upload for Existing Categories */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <CategoryImageUploader
                    categoryId={category.id}
                    currentImageUrl={undefined}
                    onImageUpload={(_imageUrl, _fileId) => {
                      onSuccess(`Image updated for ${category.title}`);
                      refetchCategories();
                    }}
                    onError={(error) => onError(`Failed to update image for ${category.title}: ${error}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <List className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No categories</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating your first category.</p>
          </div>
        )}
      </div>
    </div>
  );
}
