import React from "react";
import { ChevronDown } from "lucide-react";
import { collections } from "../../../utils/themes";

interface CollectionNavProps {
  activeCollection: string;
  onCollectionChange: (collectionId: string) => void;
}

export function CollectionNav({ activeCollection, onCollectionChange }: CollectionNavProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const activeLabel = activeCollection
    ? collections.find(c => c.id === activeCollection)?.name
    : "Collections";

  return (
    <div className="border-b border-gray-200">
      <div className="px-6 py-3">
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-gray-900">{activeLabel}</span>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

              {/* Dropdown Menu */}
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-20">
                <button
                  onClick={() => {
                    onCollectionChange("");
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors ${
                    activeCollection === "" ? "bg-blue-50 text-blue-600" : "text-gray-700"
                  }`}
                >
                  Collections
                </button>

                {collections.map(collection => (
                  <button
                    key={collection.id}
                    onClick={() => {
                      onCollectionChange(collection.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors ${
                      activeCollection === collection.id
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-700"
                    }`}
                  >
                    {collection.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
