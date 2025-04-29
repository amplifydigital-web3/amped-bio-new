import React, { useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { MarketplaceHeader } from "./MarketplaceHeader";
import { CollectionNav } from "./CollectionNav";
import { CollectionHeader } from "./CollectionHeader";
import { MarketplaceGrid } from "./MarketplaceGrid";
import { MarketplaceList } from "./MarketplaceList";
import { CollectionsOverview } from "./CollectionsOverview";
import { collections } from "../../../utils/themes";

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

  const currentCollection = collections.find(c => c.id === activeCollection);
  const filteredThemes = currentCollection
    ? currentCollection.themes
    : collections.flatMap(c => c.themes);

  const displayThemes = filteredThemes
    .filter(
      theme =>
        filter === "" ||
        theme.name.toLowerCase().includes(filter.toLowerCase()) ||
        theme.tags.some(tag => tag.toLowerCase().includes(filter.toLowerCase()))
    )
    .sort((a, b) => {
      switch (sort) {
        case "popular":
          return b.downloads - a.downloads;
        case "rating":
          return b.rating - a.rating;
        case "newest":
          return b.id.localeCompare(a.id);
        default:
          return 0;
      }
    });

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
            <CollectionHeader collection={currentCollection!} />
            {view === "grid" ? (
              <MarketplaceGrid themes={displayThemes} onApply={updateThemeConfig} />
            ) : (
              <MarketplaceList themes={displayThemes} onApply={updateThemeConfig} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
