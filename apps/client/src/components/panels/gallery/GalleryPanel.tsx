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

      <div className="px-6 pt-2 pb-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Themes</h2>
          <p className="text-sm text-gray-500">Browse and apply beautiful themes to your profile</p>
        </div>
        {/* Compact Import/Export Theme Configuration Buttons */}
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={() => useEditorStore.getState().exportTheme()}
            className="text-sm px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Export Configuration
          </button>
          <input
            type="file"
            id="import-theme-input"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                useEditorStore.getState().importTheme(file);
                e.target.value = "";
              }
            }}
            accept=".ampedtheme"
            className="hidden"
          />
          <button
            onClick={() => document.getElementById('import-theme-input')?.click()}
            className="text-sm px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Import Configuration
          </button>
        </div>
      </div>

      <CollectionNav activeCollection={activeCollection} onCollectionChange={setActiveCollection} />
      <div className="flex-1 overflow-y-auto">
        {!activeCollection ? (
          <div className="p-6">
            {/* Refactored: One collection card per row, modern layout */}
            <div className="flex flex-col gap-6">
              {collections.map(collection => {
                // Use Space Grid theme thumbnail for Abstract & Modern collection
                let previewImage = collection.thumbnail;
                if (collection.id === "abstract-modern") {
                  const spaceGridTheme = collection.themes.find(theme => theme.id === "space_grid");
                  if (spaceGridTheme) {
                    previewImage = spaceGridTheme.thumbnail;
                  }
                }
                return (
                  <div
                    key={collection.id}
                    className="bg-white rounded-2xl shadow-md hover:shadow-lg hover:scale-[1.01] transition-transform p-0 mb-2 cursor-pointer border border-gray-100 flex flex-col group overflow-hidden"
                    onClick={() => setActiveCollection(collection.id)}
                  >
                    <div className="relative w-full aspect-video bg-gray-100 rounded-t-2xl overflow-hidden">
                      <img
                        src={previewImage}
                        alt={collection.name}
                        className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                        draggable={false}
                      />
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setActiveCollection(collection.id);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold text-base rounded-t-2xl"
                      >
                        <span className="flex items-center gap-2">
                          View Collection
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </span>
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 p-6">
                      <span className="text-lg font-bold text-gray-900 break-words">{collection.name}</span>
                      <p className="text-sm text-gray-600 leading-relaxed break-words">{collection.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <CollectionHeader collection={currentCollection!} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {displayThemes.length === 0 ? (
                <div className="text-center text-gray-500 py-12">No themes found.</div>
              ) : (
                displayThemes.map(theme => (
                  <div
                    key={theme.id}
                    className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-5 flex flex-col w-full max-w-full group overflow-hidden border border-gray-100"
                  >
                    <div className="relative w-full aspect-[16/9] bg-gray-100 overflow-hidden rounded-lg mb-3">
                      <img
                        src={theme.thumbnail}
                        alt={theme.name}
                        className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                        draggable={false}
                      />
                      <button
                        onClick={() => applyTheme(theme)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white font-semibold text-base rounded-lg"
                      >
                        Apply Theme
                      </button>
                    </div>
                    <div className="mb-2">
                      <span className="text-lg font-semibold text-gray-900">{theme.name}</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 leading-relaxed">{theme.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
