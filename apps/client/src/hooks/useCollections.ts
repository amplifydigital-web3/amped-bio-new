import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc/trpc";
import { collections as hardcodedCollections } from "@/utils/themes";
import { Collection } from "@ampedbio/constants";

// Utility function to merge server collections with hardcoded collections
function mergeCollections(serverCollections: Collection[], localCollections: Collection[]): Collection[] {
  const merged: Collection[] = [...localCollections];
  
  // Add server collections that don't exist in hardcoded collections
  serverCollections.forEach(serverCollection => {
    const existsInLocal = localCollections.some(localCollection => 
      localCollection.id === serverCollection.id || 
      localCollection.name.toLowerCase() === serverCollection.name.toLowerCase()
    );
    
    if (!existsInLocal) {
      merged.push({
        id: serverCollection.id,
        name: serverCollection.name,
        description: serverCollection.description,
        themeCount: serverCollection.themeCount,
        isServer: true,
        categoryImage: serverCollection.categoryImage,
      });
    }
  });
  
  return merged;
}

export function useCollections() {
  const {
    data: serverCollections,
    isLoading,
    error,
  } = useQuery({
    ...trpc.theme.getCollections.queryOptions(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  // Merge server collections with hardcoded collections
  const collections = serverCollections 
    ? mergeCollections(serverCollections, hardcodedCollections)
    : hardcodedCollections;

  return {
    collections,
    isLoading,
    error,
    serverCollections,
    hardcodedCollections,
  };
}
