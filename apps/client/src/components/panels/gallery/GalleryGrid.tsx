import { Trash2, ExternalLink } from "lucide-react";
import type { GalleryImage } from "../../../types/editor";

interface GalleryGridProps {
  images: GalleryImage[];
  onRemove: (url: string) => void;
}

export function GalleryGrid({ images, onRemove }: GalleryGridProps) {
  if (images.length === 0) {
    return <div className="text-center py-8 text-gray-500">No images in gallery yet</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {images.map(image => (
        <div
          key={image.url}
          className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100"
        >
          <img src={image.url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => onRemove(image.url)}
              className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <a
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-blue-500 rounded-full text-white hover:bg-blue-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
