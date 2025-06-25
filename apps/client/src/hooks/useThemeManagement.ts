import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../utils/trpc";
import { toast } from "react-hot-toast";

/**
 * Hook for managing themes using tRPC
 */
export function useThemeManagement() {
  const queryClient = useQueryClient();

  // Get user's themes
  const {
    data: userThemes,
    isLoading: isLoadingThemes,
    error: themesError,
    refetch: refetchThemes,
  } = useQuery(trpc.theme.getUserThemes.queryOptions());

  // Edit/Create theme mutation
  const editThemeMutation = useMutation({
    ...trpc.theme.editTheme.mutationOptions(),
    onSuccess: () => {
      toast.success("Theme saved successfully!");
      // Invalidate and refetch themes
      queryClient.invalidateQueries({
        queryKey: trpc.theme.getUserThemes.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to save theme: ${error.message}`);
    },
  });

  // Delete theme mutation
  const deleteThemeMutation = useMutation({
    ...trpc.theme.deleteTheme.mutationOptions(),
    onSuccess: () => {
      toast.success("Theme deleted successfully!");
      // Invalidate and refetch themes
      queryClient.invalidateQueries({
        queryKey: trpc.theme.getUserThemes.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to delete theme: ${error.message}`);
    },
  });

  // Get specific theme (for public viewing)
  const getTheme = (id: number) => {
    return useQuery(trpc.themeGallery.getTheme.queryOptions({ id }));
  };

  return {
    // Data
    userThemes,
    isLoadingThemes,
    themesError,

    // Actions
    editTheme: editThemeMutation.mutate,
    deleteTheme: deleteThemeMutation.mutate,
    refetchThemes,
    getTheme,

    // Mutation states
    isEditingTheme: editThemeMutation.isPending,
    isDeletingTheme: deleteThemeMutation.isPending,
  };
}
