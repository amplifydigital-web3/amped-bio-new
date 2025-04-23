import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { collections } from "../../../utils/themes";

interface CollectionNavProps {
  activeCollection: string;
  onCollectionChange: (collectionId: string) => void;
}

export function CollectionNav({ activeCollection, onCollectionChange }: CollectionNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const activeLabel = activeCollection
    ? collections.find(c => c.id === activeCollection)?.name
    : "Collections";

  const filteredCollections = useMemo(() => {
    return searchQuery
      ? [{ id: "", name: "Collections" }, ...collections].filter(c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [{ id: "", name: "Collections" }, ...collections];
  }, [searchQuery]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex(prev => (prev < filteredCollections.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          if (focusedIndex >= 0) {
            const selectedId = focusedIndex === 0 ? "" : filteredCollections[focusedIndex].id;
            onCollectionChange(selectedId);
            setIsOpen(false);
            setSearchQuery("");
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, filteredCollections, onCollectionChange]);

  // Focus the search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && optionsRef.current[focusedIndex]) {
      optionsRef.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectOption = (collectionId: string) => {
    onCollectionChange(collectionId);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="border-b border-gray-200">
      <div className="px-6 py-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          >
            <span className="font-medium text-gray-900 truncate">{activeLabel}</span>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-20 transition-all duration-200 opacity-100 transform translate-y-0">
              <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search collections..."
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setFocusedIndex(-1);
                    }}
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto py-1" role="listbox">
                {filteredCollections.length > 0 ? (
                  filteredCollections.map((collection, index) => {
                    const isAll = collection.id === "";
                    const isActive = isAll
                      ? activeCollection === ""
                      : activeCollection === collection.id;

                    return (
                      <button
                        key={collection.id || "all"}
                        ref={el => (optionsRef.current[index] = el)}
                        onClick={() => handleSelectOption(collection.id)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        role="option"
                        aria-selected={isActive}
                        className={`w-full px-4 py-2.5 text-left transition-colors flex items-center ${
                          isActive
                            ? "bg-blue-50 text-blue-600"
                            : focusedIndex === index
                              ? "bg-gray-50 text-gray-900"
                              : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="truncate">{collection.name}</span>
                        {isActive && (
                          <span className="ml-auto text-blue-600">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-2 text-sm text-gray-500">No collections found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
