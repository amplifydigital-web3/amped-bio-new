import type { MarketplaceTheme, Collection } from "../types/editor";

// Modern & Minimal Collection Themes
const modernThemes: MarketplaceTheme[] = [
  {
    id: "modern-bubbles",
    name: "Bubbles",
    description: "Dynamic bubble animations with a sleek modern feel",
    thumbnail: "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 12500,
    rating: 4.8,
    tags: ["minimal", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Bubbles.mp4",
      },
    },
  },
  {
    id: "modern-cube-wall",
    name: "Cube Wall",
    description: "Geometric cube patterns with depth and dimension",
    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 9800,
    rating: 4.7,
    tags: ["geometric", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Cube_Wall.mp4",
      },
    },
  },
  {
    id: "modern-dot-matrix",
    name: "Dot Matrix",
    description: "Elegant dot patterns with smooth animations",
    thumbnail: "https://images.unsplash.com/photo-1550859492-d5da9d8e45f3?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 8900,
    rating: 4.6,
    tags: ["dots", "modern", "minimal"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Dot_Matrix.mp4",
      },
    },
  },
  {
    id: "modern-event-horizon",
    name: "Event Horizon",
    description: "Abstract cosmic event with mesmerizing visuals",
    thumbnail: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 10300,
    rating: 4.8,
    tags: ["space", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Event_Horizon.mp4",
      },
    },
  },
  {
    id: "modern-fractal-flower",
    name: "Fractal Flower",
    description: "Hypnotic fractal patterns blooming with color",
    thumbnail: "https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 11200,
    rating: 4.7,
    tags: ["fractals", "modern", "colorful"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Fractal_Flower.mp4",
      },
    },
  },
  {
    id: "modern-inferno",
    name: "Inferno",
    description: "Dynamic fire-like abstract visuals with deep warmth",
    thumbnail: "https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?w=400&h=300&fit=crop",
    author: "Alex Design",
    downloads: 9400,
    rating: 4.5,
    tags: ["fire", "modern", "warm"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Inferno.mp4",
      },
    },
  },
];

// Nature & Organic Collection Themes
const natureThemes: MarketplaceTheme[] = [
  {
    id: "nature-beach-house",
    name: "Beach House",
    description: "Serene coastal view with gentle waves",
    thumbnail: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 8700,
    rating: 4.6,
    tags: ["nature", "beach", "water"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Beach_House.mp4",
      },
    },
  },
  {
    id: "nature-big-sky",
    name: "Big Sky",
    description: "Expansive sky view with stunning cloud formations",
    thumbnail: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 7200,
    rating: 4.5,
    tags: ["nature", "sky", "clouds"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Big_Sky.mp4",
      },
    },
  },
  {
    id: "nature-forest-sunbeams",
    name: "Forest Sunbeams",
    description: "Magical forest with sunlight filtering through trees",
    thumbnail: "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 8900,
    rating: 4.7,
    tags: ["nature", "forest", "sunlight"],
    theme: {
      background: {
        type: "video",
        value:
          "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Forest_Sunbeams.mp4",
      },
    },
  },
  {
    id: "nature-kitten",
    name: "Kitten",
    description: "Adorable kitten with playful charm",
    thumbnail: "https://images.unsplash.com/photo-1574144283535-5a5c5c636d5d?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 9500,
    rating: 4.9,
    tags: ["nature", "animal", "cute"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Kitten.mp4",
      },
    },
  },
  {
    id: "nature-kyoto-rain",
    name: "Kyoto Rain",
    description: "Atmospheric rainy scene in tranquil Kyoto",
    thumbnail: "https://images.unsplash.com/photo-1519181245277-cffeb31da2e3?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 7800,
    rating: 4.6,
    tags: ["nature", "rain", "japan"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Kyoto_Rain.mp4",
      },
    },
  },
  {
    id: "nature-sakura",
    name: "Sakura",
    description: "Beautiful cherry blossoms in full bloom",
    thumbnail: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&h=300&fit=crop",
    author: "Emma Nature",
    downloads: 8300,
    rating: 4.7,
    tags: ["nature", "flowers", "spring"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Sakura.mp4",
      },
    },
  },
];

// Cyberpunk Collection Themes
const cyberpunkThemes: MarketplaceTheme[] = [
  {
    id: "cyber-astral-staircase",
    name: "Astral Staircase",
    description: "Mesmerizing staircase to another dimension",
    thumbnail: "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 11200,
    rating: 4.9,
    tags: ["cyberpunk", "space", "futuristic"],
    theme: {
      background: {
        type: "video",
        value:
          "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Astral_Staircase.mp4",
      },
    },
  },
  {
    id: "cyber-arches",
    name: "Cyber Arches",
    description: "Futuristic architectural arches with neon lighting",
    thumbnail: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 9400,
    rating: 4.7,
    tags: ["cyberpunk", "architecture", "neon"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Cyber_Arches.mp4",
      },
    },
  },
  {
    id: "cyber-corridor",
    name: "Cyber Corridor",
    description: "High-tech corridor with flowing digital elements",
    thumbnail: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 10300,
    rating: 4.8,
    tags: ["cyberpunk", "tech", "digital"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Cyber_Corridor.mp4",
      },
    },
  },
  {
    id: "cyber-dark-lightning",
    name: "Dark Lightning",
    description: "Electric energy with dark atmospheric visuals",
    thumbnail: "https://images.unsplash.com/photo-1535868463750-2646f8e60f89?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 8700,
    rating: 4.6,
    tags: ["cyberpunk", "energy", "dark"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Dark_Lightning.mp4",
      },
    },
  },
  {
    id: "cyber-night-city",
    name: "Night City",
    description: "Futuristic cityscape with neon lights",
    thumbnail: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 12500,
    rating: 4.9,
    tags: ["cyberpunk", "city", "night"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Night_City.mp4",
      },
    },
  },
  {
    id: "cyber-neo",
    name: "Neo",
    description: "Digital matrix-inspired visual effect",
    thumbnail: "https://images.unsplash.com/photo-1515630278258-407f66498911?w=400&h=300&fit=crop",
    author: "Neo Digital",
    downloads: 9800,
    rating: 4.7,
    tags: ["cyberpunk", "matrix", "digital"],
    locked: true,
    nftRequirement: {
      contractAddress: "0x456...",
      chainId: 1,
      minBalance: 1,
      name: "Cyberpunk NFT",
      image: "https://images.unsplash.com/photo-1515630278258-407f66498911?w=100&h=100&fit=crop",
      price: "0.15 ETH",
      marketplace: "https://opensea.io",
    },
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Neo.mp4",
      },
    },
  },
];

// Winter Holidays Collection Themes
const winterThemes: MarketplaceTheme[] = [
  {
    id: "winter-ornaments",
    name: "Christmas Ornaments",
    description: "Festive holiday ornaments with seasonal charm",
    thumbnail: "https://images.unsplash.com/photo-1607262807149-dfd4c39320a6?w=400&h=300&fit=crop",
    author: "Marina Waves",
    downloads: 7800,
    rating: 4.6,
    tags: ["winter", "christmas", "holiday"],
    theme: {
      background: {
        type: "video",
        value:
          "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Christmas_Ornaments.mp4",
      },
    },
  },
  {
    id: "winter-sleigh",
    name: "Sleigh Ride",
    description: "Nostalgic winter sleigh ride through snowy landscape",
    thumbnail: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=400&h=300&fit=crop",
    author: "Marina Waves",
    downloads: 6500,
    rating: 4.5,
    tags: ["winter", "sleigh", "snow"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Sleigh_Ride.mp4",
      },
    },
  },
  {
    id: "winter-snow-globe",
    name: "Snow Globe",
    description: "Magical snow globe with whimsical winter scene",
    thumbnail: "https://images.unsplash.com/photo-1543557774-0661db793588?w=400&h=300&fit=crop",
    author: "Marina Waves",
    downloads: 8900,
    rating: 4.7,
    tags: ["winter", "globe", "magical"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Snow_Globe.mp4",
      },
    },
  },
  {
    id: "winter-snowflakes",
    name: "Snowflakes",
    description: "Beautiful falling snowflakes with winter tranquility",
    thumbnail: "https://images.unsplash.com/photo-1542376333-4481d6e29c05?w=400&h=300&fit=crop",
    author: "Marina Waves",
    downloads: 9200,
    rating: 4.8,
    tags: ["winter", "snow", "gentle"],
    theme: {
      background: {
        type: "video",
        value: "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Snowflakes.mp4",
      },
    },
  },
  {
    id: "winter-wonderland",
    name: "Winter Wonderland",
    description: "Serene winter landscape with magical atmosphere",
    thumbnail: "https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?w=400&h=300&fit=crop",
    author: "Marina Waves",
    downloads: 10500,
    rating: 4.9,
    tags: ["winter", "landscape", "wonderland"],
    theme: {
      background: {
        type: "video",
        value:
          "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds/Winter_Wonderland.mp4",
      },
    },
  },
];

// Define Collections
const modernCollection: Collection = {
  id: "abstract",
  name: "Abstract & Modern",
  description:
    "Step into a visually striking universe where art meets technology. The Abstract & Modern collection features a curated set of dynamic video themes that blend geometric elegance, fluid motion, and vibrant lightplay. From the immersive depths of Jade Tunnel and Neon Tunnel to the hypnotic pulses of Fractal Flower and Dot Matrix, each piece evokes a futuristic atmosphere. This collection turns space into experience with a seamless fusion of light, structure, and energy.",
  collaborator: {
    name: "Alex Design",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop",
    url: "https://x.com/alexdesign",
    bio: "UI/UX Designer specializing in minimal interfaces",
  },
  themeCount: modernThemes.length,
  downloads: 24680,
  rating: 4.8,
  themes: modernThemes,
};

const natureCollection: Collection = {
  id: "nature",
  name: "Nature & Organic",
  description:
    "Immerse yourself in the soothing rhythms of the natural world with the Nature & Organic collection. From the golden glow of Savannah Sunset to the gentle drift of Kyoto Rain, each video theme captures serene, atmospheric moments that evoke calm and connection. Whether it's the quiet charm of Kitten, the mystical allure of Moonlight Campfire, or the vibrant bloom of Sakura, this collection brings the beauty of earth, sky, and life into a tranquil escape.",
  collaborator: {
    name: "Emma Nature",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop",
    url: "https://x.com/emmanature",
    bio: "Environmental artist and digital designer",
  },
  themeCount: natureThemes.length,
  downloads: 18450,
  rating: 4.7,
  themes: natureThemes,
};

const cyberpunkCollection: Collection = {
  id: "cyber",
  name: "Cyberpunk & Fantasy",
  description:
    "Enter a realm where futuristic cities pulse with neon light and arcane energies swirl through digital dreamscapes. The Cyberpunk & Fantasy collection fuses high-tech aesthetics with otherworldly wonder—featuring glowing Cyber Corridors, mysterious Magic Portals, and the electric tension of Dark Lightning. From the surreal geometry of Ellipse to the sprawling glow of Night City, each video theme conjures immersive sci-fi and fantasy realms. Welcome to a world where the line between magic and machine blurs.",
  collaborator: {
    name: "Neo Digital",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop",
    url: "https://x.com/neodigital",
    bio: "Digital artist exploring the intersection of art and technology",
  },
  themeCount: cyberpunkThemes.length,
  downloads: 21340,
  rating: 4.9,
  themes: cyberpunkThemes,
};

const winterCollection: Collection = {
  id: "winter",
  name: "Winter Holidays",
  description:
    "Celebrate the magic of the season with the Winter Holidays collection—a cozy blend of festive cheer and winter wonder. Sparkling Snowflakes, classic Christmas Ornaments, and the nostalgic charm of a Sleigh Ride set the mood for joyful gatherings. From the serene beauty of Winter Wonderland to the whimsical charm of a swirling Snow Globe, these video themes evoke warmth, wonder, and holiday spirit.",
  collaborator: {
    name: "Marina Waves",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop",
    url: "https://x.com/marinawaves",
    bio: "Marine photographer and digital creator",
  },
  themeCount: winterThemes.length,
  downloads: 15780,
  rating: 4.6,
  themes: winterThemes,
};

// Export collections and themes
export const collections: Collection[] = [
  modernCollection,
  natureCollection,
  cyberpunkCollection,
  winterCollection,
];

export const marketplaceThemes = collections.flatMap(c => c.themes);
