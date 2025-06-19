import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc/trpc";
import { useEditorStore } from "../../../store/editorStore";
import { useCollections } from "../../../hooks/useCollections";
import type { MarketplaceTheme } from "../../../types/editor";
import { MarketplaceHeader } from "./MarketplaceHeader";
import { CollectionNav } from "./CollectionNav";
import { CollectionHeader } from "./CollectionHeader";
import { MarketplaceGrid } from "./MarketplaceGrid";
import { MarketplaceList } from "./MarketplaceList";
import { CollectionsOverview } from "./CollectionsOverview";

export function GalleryPanel() {
  const [activeCollection, setActiveCollection] = useState("");
  const view = useEditorStore(state => state.marketplaceView);
  const filter = useEditorStore(state => state.marketplaceFilter);
  const sort = useEditorStore(state => state.marketplaceSort);
  const setView = useEditorStore(state => state.setMarketplaceView);
  const setFilter = useEditorStore(state => state.setMarketplaceFilter);
  const setSort = useEditorStore(state => state.setMarketplaceSort);
  const applyTheme = useEditorStore(state => state.applyTheme);
  const updateThemeConfig = useEditorStore(state => state.updateThemeConfig);

  // Wrapper function to handle theme application without marking as changed
  const handleThemeApply = (themeConfig: MarketplaceTheme["theme"]) => {
    // Create a Theme object from the theme config for applyTheme
    const themeToApply = {
      id: 0, // Temporary ID for applied themes
      name: "Applied Theme",
      share_level: "public",
      share_config: {},
      config: themeConfig
    };
    applyTheme(themeToApply);
  };

  // Get collections (merged server + hardcoded)
  const { collections } = useCollections();
  
  // Find the current collection
  const currentCollection = collections.find(c => c.id === activeCollection);
  
  // For server collections, fetch themes from the server
  const isServerCollection = currentCollection?.isServer;
  const { data: serverThemes, isLoading: isLoadingServerThemes } = useQuery({
    ...trpc.themeGallery.getThemesByCategory.queryOptions({
      id: parseInt(activeCollection)
    }),
    enabled: !!(isServerCollection && activeCollection && !isNaN(parseInt(activeCollection))),
  });

  // Determine which themes to show
  const getFilteredThemes = () => {
    if (!activeCollection) {
      // Show all themes from all collections (only hardcoded collections have themes)
      return collections.flatMap(c => c.themes || []);
    }
    
    if (isServerCollection && serverThemes) {
      // For server collections, use themes from server
      // Convert server theme format to marketplace theme format
      return serverThemes.themes.map((theme: any) => ({
        id: theme.id.toString(),
        name: theme.name,
        description: theme.description || "",
        thumbnail: theme.thumbnailImage?.url || "",
        tags: [] as string[], // Server themes don't have tags
        theme: theme.config || {},
        user_id: theme.user?.id || null // null means admin theme (user_id = 0)
      }));
    }
    
    // For hardcoded collections, use existing themes
    return currentCollection?.themes || [];
  };

  const filteredThemes = getFilteredThemes();

  const displayThemes = filteredThemes
    .filter(
      theme =>
        filter === "" ||
        theme.name.toLowerCase().includes(filter.toLowerCase()) ||
        (theme.tags && theme.tags.some(tag => tag.toLowerCase().includes(filter.toLowerCase())))
    )
    .sort((a, b) => {
      switch (sort) {
        case "popular":
          // Sort by name as a fallback since we don't have download data
          return a.name.localeCompare(b.name);
        case "newest":
          return b.id.localeCompare(a.id);
        default:
          return 0;
      }
    });

  // Show loading state when fetching server themes
  const isLoading = isServerCollection && isLoadingServerThemes;

  return (
    <div className="h-full flex flex-col">
      <MarketplaceHeader
        view={view}
        filter={filter}
        sort={sort}
        onViewChange={setView}
        onFilterChange={setFilter}
        onSortChange={setSort}
      />

      <CollectionNav activeCollection={activeCollection} onCollectionChange={setActiveCollection} />

      <div className="flex-1 overflow-y-auto">
        {!activeCollection ? (
          <CollectionsOverview onCollectionSelect={setActiveCollection} />
        ) : (
          <div className="p-6">
            <CollectionHeader collection={currentCollection} />
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-lg text-gray-600">Loading themes...</div>
              </div>
            ) : view === "grid" ? (
              <MarketplaceGrid themes={displayThemes} onApply={handleThemeApply} />
            ) : (
              <MarketplaceList themes={displayThemes} onApply={handleThemeApply} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
