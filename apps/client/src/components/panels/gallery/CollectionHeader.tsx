import React from "react";
import { Sparkles } from "lucide-react";
import type { Collection } from "../../../types/editor";

interface CollectionHeaderProps {
  collection?: Collection;
}

export function CollectionHeader({ collection }: CollectionHeaderProps) {
  // Early return if no collection is provided
  if (!collection) {
    return (
      <div className="relative mb-32">
        <div className="relative h-[500px] bg-gradient-to-r from-gray-500 to-gray-600 overflow-hidden rounded-2xl flex items-center justify-center">
          <h1 className="text-7xl font-bold text-white tracking-tight drop-shadow-lg">
            Loading Collection...
          </h1>
        </div>
      </div>
    );
  }

  // Collection-specific styles and images
  const styles = {
    abstract: {
      gradient: "from-blue-500 to-purple-500",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-purple-500",
      highlight: "text-purple-500",
      image: "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2",
      overlayOpacity: "opacity-40",
    },
    nature: {
      gradient: "from-emerald-500 to-green-500",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='52' height='26' viewBox='0 0 52 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-green-500",
      highlight: "text-green-500",
      image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
      overlayOpacity: "opacity-50",
    },
    cyber: {
      gradient: "from-pink-500 to-purple-500",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M0 0h60v60H0V0zm30 30h30v30H30V30zm-15 0h15v30H15V30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-pink-500",
      highlight: "text-pink-500",
      image: "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2",
      overlayOpacity: "opacity-60",
    },
    winter: {
      gradient: "from-blue-400 to-cyan-500",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='56' height='28' viewBox='0 0 56 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M56 26v2h-7.75c2.3-1.27 4.94-2 7.75-2zm-26 2a2 2 0 1 0-4 0h-4.09A25.98 25.98 0 0 0 0 16v-2c.67 0 1.34.02 2 .07V14a2 2 0 0 0-2-2v-2a4 4 0 0 1 3.98 3.6 28.09 28.09 0 0 1 2.8-3.86A8 8 0 0 0 0 6V4a9.99 9.99 0 0 1 8.17 4.23c.94-.95 1.96-1.83 3.03-2.63A13.98 13.98 0 0 0 0 0h7.75c2 1.1 3.73 2.63 5.1 4.45 1.12-.72 2.3-1.37 3.53-1.93A20.1 20.1 0 0 0 14.28 0h2.7c.45.56.88 1.14 1.29 1.74 1.3-.48 2.63-.87 4-1.15-.11-.2-.23-.4-.36-.59H26v.07a28.4 28.4 0 0 1 4 0V0h4.09l-.37.59c1.38.28 2.72.67 4.01 1.15.4-.6.84-1.18 1.3-1.74h2.69a20.1 20.1 0 0 0-2.1 2.52c1.23.56 2.41 1.2 3.54 1.93A16.08 16.08 0 0 1 48.25 0H56c-4.58 0-8.65 2.2-11.2 5.6 1.07.8 2.09 1.68 3.03 2.63A9.99 9.99 0 0 1 56 4v2a8 8 0 0 0-6.77 3.74c1.03 1.2 1.97 2.5 2.79 3.86A4 4 0 0 1 56 10v2a2 2 0 0 0-2 2.07 28.4 28.4 0 0 1 2-.07v2c-9.2 0-17.3 4.78-21.91 12H30zM7.75 28H0v-2c2.81 0 5.46.73 7.75 2zM56 20v2c-5.6 0-10.65 2.3-14.28 6h-2.7c4.04-4.89 10.15-8 16.98-8zm-39.03 8h-2.69C10.65 24.3 5.6 22 0 22v-2c6.83 0 12.94 3.11 16.97 8zm15.01-.4a28.09 28.09 0 0 1 2.8-3.86 8 8 0 0 0-13.55 0c1.03 1.2 1.97 2.5 2.79 3.86a4 4 0 0 1 7.96 0zm14.29-11.86c1.3-.48 2.63-.87 4-1.15a25.99 25.99 0 0 0-44.55 0c1.38.28 2.72.67 4.01 1.15a21.98 21.98 0 0 1 36.54 0z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-cyan-500",
      highlight: "text-cyan-500",
      image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
      overlayOpacity: "opacity-40",
    },
    redbull: {
      gradient: "from-[#DB0A40] to-[#1E2127]",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M30 0l30 15v15L30 15 0 30v-15L30 0zm0 60L0 45v-15l30 15 30-15v15L30 60z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-[#DB0A40]",
      highlight: "text-[#DB0A40]",
      image: "https://images.unsplash.com/photo-1541773367336-d3f7c69deef4",
      overlayOpacity: "opacity-70",
    },
    chanel: {
      gradient: "from-black to-[#1a1a1a]",
      pattern:
        "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M30 30h30v30H30V30zm0-30h30v30H30V0zM0 30h30v30H0V30zM0 0h30v30H0V0z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      accent: "bg-black",
      highlight: "text-black",
      image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d",
      overlayOpacity: "opacity-50",
    },
  };

  // Get style based on collection ID, with fallback for server collections
  const getStyleKey = (collectionId: string): keyof typeof styles => {
    // For server collections (numeric IDs), map based on collection name
    if (collection?.isServer) {
      const name = collection.name?.toLowerCase() || '';
      if (name.includes('abstract') || name.includes('modern')) return 'abstract';
      if (name.includes('nature') || name.includes('organic')) return 'nature';
      if (name.includes('cyber') || name.includes('tech')) return 'cyber';
      if (name.includes('winter') || name.includes('snow')) return 'winter';
      return 'abstract'; // default fallback
    }
    
    // For client collections, use ID directly
    return (collectionId as keyof typeof styles) in styles 
      ? (collectionId as keyof typeof styles) 
      : 'abstract';
  };

  const style = styles[getStyleKey(collection?.id || 'abstract')];

  return (
    <div className="relative mb-32">
      {/* Dynamic Banner Background */}
      <div
        className={`relative h-[500px] bg-gradient-to-r ${style.gradient} overflow-hidden rounded-2xl`}
      >
        {/* Background Image with Overlay */}
        <img
          src={style.image}
          alt={collection?.name || 'Collection'}
          className={`absolute inset-0 w-full h-full object-cover ${style.overlayOpacity}`}
        />

        {/* Gradient Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-r ${style.gradient} mix-blend-overlay`} />

        {/* Animated Pattern Overlay */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: style.pattern }} />

        {/* Animated Particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`absolute w-2 h-2 rounded-full ${style.accent} animate-float`}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                opacity: 0.3,
              }}
            />
          ))}
        </div>

        {/* Collection Title Overlay */}
        <div className="absolute inset-0 flex items-center justify-center text-center p-6">
          <div className="space-y-6">
            <h1 className="text-7xl font-bold text-white tracking-tight drop-shadow-lg">
              {collection?.name || 'Collection'}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-white" />
              <p className="text-2xl text-white/90">Premium Theme Collection</p>
            </div>
          </div>
        </div>

        {/* Collection Stats Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/20 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-8 py-6 flex items-center justify-center">
            <div className="text-center text-white">
              <p className="text-4xl font-bold">{collection?.themeCount || 0}</p>
              <p className="text-sm opacity-90">Unique Themes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Collection Info Card */}
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-4xl">
        <div className="bg-white/50 backdrop-blur-md rounded-xl shadow-xl p-8">
          <div className="flex items-start gap-8">
            {/* Collection Description */}
            <div className="flex-1 min-w-0">
              <p className="text-xl text-gray-900 leading-relaxed mb-6">{collection?.description || ''}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
