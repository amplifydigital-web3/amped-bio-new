import { useQuery } from "@tanstack/react-query";
import { trpc } from "../utils/trpc";

/**
 * Hook for browsing public themes in the gallery
 */
export function useThemeGallery() {
  // Get theme categories
  const {
    data: categories,
    isLoading: isLoadingCategories,
    error: categoriesError,
  } = useQuery(trpc.themeGallery.getThemeCategories.queryOptions());

  // Get specific theme by ID (public view)
  const getTheme = (id: number) => {
    return useQuery(trpc.themeGallery.getTheme.queryOptions({ id }));
  };

  // Get themes by category
  const getThemesByCategory = (categoryId: number) => {
    return useQuery(
      trpc.themeGallery.getThemesByCategory.queryOptions({ id: categoryId })
    );
  };

  return {
    // Data
    categories,
    isLoadingCategories,
    categoriesError,

    // Actions
    getTheme,
    getThemesByCategory,
  };
}
