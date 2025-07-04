import React from "react";
import { useCollections } from "../../../hooks/useCollections";

interface CollectionsOverviewProps {
  onCollectionSelect: (collectionId: string) => void;
}

export function CollectionsOverview({ onCollectionSelect }: CollectionsOverviewProps) {
  const { collections } = useCollections();
  const getCollectionStyle = (collection: any) => {
    const id = collection.id;
    const name = collection.name?.toLowerCase() || '';
    
    // For server collections (numeric IDs), map based on collection name
    if (collection.isServer) {
      if (name.includes('abstract') || name.includes('modern')) {
        return {
          gradient: "from-blue-500 to-purple-500",
          pattern: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: collection.categoryImage?.url || "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2",
        };
      }
      if (name.includes('nature') || name.includes('organic')) {
        return {
          gradient: "from-emerald-500 to-green-500",
          pattern: "url(\"data:image/svg+xml,%3Csvg width='52' height='26' viewBox='0 0 52 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: collection.categoryImage?.url || "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
        };
      }
      if (name.includes('cyber') || name.includes('tech')) {
        return {
          gradient: "from-pink-500 to-purple-500",
          pattern: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M0 0h60v60H0V0zm30 30h30v30H30V30zm-15 0h15v30H15V30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: collection.categoryImage?.url || "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2",
        };
      }
      if (name.includes('winter') || name.includes('snow')) {
        return {
          gradient: "from-blue-400 to-cyan-500",
          pattern: "url(\"data:image/svg+xml,%3Csvg width='56' height='28' viewBox='0 0 56 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M56 26v2h-7.75c2.3-1.27 4.94-2 7.75-2zm-26 2a2 2 0 1 0-4 0h-4.09A25.98 25.98 0 0 0 0 16v-2c.67 0 1.34.02 2 .07V14a2 2 0 0 0-2-2v-2a4 4 0 0 1 3.98 3.6 28.09 28.09 0 0 1 2.8-3.86A8 8 0 0 0 0 6V4a9.99 9.99 0 0 1 8.17 4.23c.94-.95 1.96-1.83 3.03-2.63A13.98 13.98 0 0 0 0 0h7.75c2 1.1 3.73 2.63 5.1 4.45 1.12-.72 2.3-1.37 3.53-1.93A20.1 20.1 0 0 0 14.28 0h2.7c.45.56.88 1.14 1.29 1.74 1.3-.48 2.63-.87 4-1.15-.11-.2-.23-.4-.36-.59H26v.07a28.4 28.4 0 0 1 4 0V0h4.09l-.37.59c1.38.28 2.72.67 4.01 1.15.4-.6.84-1.18 1.3-1.74h2.69a20.1 20.1 0 0 0-2.1 2.52c1.23.56 2.41 1.2 3.54 1.93A16.08 16.08 0 0 1 48.25 0H56c-4.58 0-8.65 2.2-11.2 5.6 1.07.8 2.09 1.68 3.03 2.63A9.99 9.99 0 0 1 56 4v2a8 8 0 0 0-6.77 3.74c1.03 1.2 1.97 2.5 2.79 3.86A4 4 0 0 1 56 10v2a2 2 0 0 0-2 2.07 28.4 28.4 0 0 1 2-.07v2c-9.2 0-17.3 4.78-21.91 12H30zM7.75 28H0v-2c2.81 0 5.46.73 7.75 2zM56 20v2c-5.6 0-10.65 2.3-14.28 6h-2.7c4.04-4.89 10.15-8 16.98-8zm-39.03 8h-2.69C10.65 24.3 5.6 22 0 22v-2c6.83 0 12.94 3.11 16.97 8zm15.01-.4a28.09 28.09 0 0 1 2.8-3.86 8 8 0 0 0-13.55 0c1.03 1.2 1.97 2.5 2.79 3.86a4 4 0 0 1 7.96 0zm14.29-11.86c1.3-.48 2.63-.87 4-1.15a25.99 25.99 0 0 0-44.55 0c1.38.28 2.72.67 4.01 1.15a21.98 21.98 0 0 1 36.54 0z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: collection.categoryImage?.url || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
        };
      }
      // Default for server collections
      return {
        gradient: "from-purple-500 to-indigo-500",
        pattern: "",
        image: collection.categoryImage?.url || "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2",
      };
    }
    
    // For hardcoded collections, use the existing switch logic
    switch (id) {
      case "abstract":
        return {
          gradient: "from-blue-500 to-purple-500",
          pattern:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2",
        };
      case "nature":
        return {
          gradient: "from-emerald-500 to-green-500",
          pattern:
            "url(\"data:image/svg+xml,%3Csvg width='52' height='26' viewBox='0 0 52 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
        };
      case "cyber":
        return {
          gradient: "from-pink-500 to-purple-500",
          pattern:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M0 0h60v60H0V0zm30 30h30v30H30V30zm-15 0h15v30H15V30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2",
        };
      case "winter":
        return {
          gradient: "from-blue-400 to-cyan-500",
          pattern:
            "url(\"data:image/svg+xml,%3Csvg width='56' height='28' viewBox='0 0 56 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M56 26v2h-7.75c2.3-1.27 4.94-2 7.75-2zm-26 2a2 2 0 1 0-4 0h-4.09A25.98 25.98 0 0 0 0 16v-2c.67 0 1.34.02 2 .07V14a2 2 0 0 0-2-2v-2a4 4 0 0 1 3.98 3.6 28.09 28.09 0 0 1 2.8-3.86A8 8 0 0 0 0 6V4a9.99 9.99 0 0 1 8.17 4.23c.94-.95 1.96-1.83 3.03-2.63A13.98 13.98 0 0 0 0 0h7.75c2 1.1 3.73 2.63 5.1 4.45 1.12-.72 2.3-1.37 3.53-1.93A20.1 20.1 0 0 0 14.28 0h2.7c.45.56.88 1.14 1.29 1.74 1.3-.48 2.63-.87 4-1.15-.11-.2-.23-.4-.36-.59H26v.07a28.4 28.4 0 0 1 4 0V0h4.09l-.37.59c1.38.28 2.72.67 4.01 1.15.4-.6.84-1.18 1.3-1.74h2.69a20.1 20.1 0 0 0-2.1 2.52c1.23.56 2.41 1.2 3.54 1.93A16.08 16.08 0 0 1 48.25 0H56c-4.58 0-8.65 2.2-11.2 5.6 1.07.8 2.09 1.68 3.03 2.63A9.99 9.99 0 0 1 56 4v2a8 8 0 0 0-6.77 3.74c1.03 1.2 1.97 2.5 2.79 3.86A4 4 0 0 1 56 10v2a2 2 0 0 0-2 2.07 28.4 28.4 0 0 1 2-.07v2c-9.2 0-17.3 4.78-21.91 12H30zM7.75 28H0v-2c2.81 0 5.46.73 7.75 2zM56 20v2c-5.6 0-10.65 2.3-14.28 6h-2.7c4.04-4.89 10.15-8 16.98-8zm-39.03 8h-2.69C10.65 24.3 5.6 22 0 22v-2c6.83 0 12.94 3.11 16.97 8zm15.01-.4a28.09 28.09 0 0 1 2.8-3.86 8 8 0 0 0-13.55 0c1.03 1.2 1.97 2.5 2.79 3.86a4 4 0 0 1 7.96 0zm14.29-11.86c1.3-.48 2.63-.87 4-1.15a25.99 25.99 0 0 0-44.55 0c1.38.28 2.72.67 4.01 1.15a21.98 21.98 0 0 1 36.54 0z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
        };

      default:
        return {
          gradient: "from-gray-500 to-gray-600",
          pattern: "",
          image: "",
        };
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
      {collections.map(collection => {
        const style = getCollectionStyle(collection);

        return (
          <button
            key={collection.id}
            onClick={() => onCollectionSelect(collection.id)}
            className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
          >
            {/* Collection Banner */}
            <div className={`h-48 relative overflow-hidden bg-gradient-to-r ${style.gradient}`}>
              {/* Background Image */}
              <img
                src={style.image}
                alt={collection.name}
                className="absolute inset-0 w-full h-full object-cover object-center opacity-50"
              />

              {/* Pattern Overlay */}
              <div
                className="absolute inset-0 opacity-20"
                style={{ backgroundImage: style.pattern }}
              />

              {/* Gradient Overlay */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${style.gradient} mix-blend-overlay`}
              />

              {/* Collection Title */}
              <div className="absolute inset-0 flex items-center justify-center">
                <h2 className="text-3xl font-bold text-white text-center px-6 drop-shadow-lg">
                  {collection.name}
                </h2>
              </div>
            </div>

            {/* Collection Info */}
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">{collection.description}</p>

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="px-6 py-3 bg-white rounded-lg font-medium">View Collection</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
