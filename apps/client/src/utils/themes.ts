import type { MarketplaceTheme, Collection } from "../types/editor";

// Use the same AWS S3 URL as in backgrounds.ts
const awsS3 =
  import.meta.env?.AWS_S3_BACKGROUNDS ||
  "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds";

// Update thumbnailsPath to use S3 URL
const thumbnailsPath = awsS3;

// Modern & Minimal Collection Themes
const modernThemes: MarketplaceTheme[] = [
  {
    id: "modern-bubbles",
    name: "Bubbles",
    description: "Dynamic bubble animations with a sleek modern feel",
    thumbnail: `${thumbnailsPath}/Bubbles_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 12500,
    rating: 4.8,
    tags: ["minimal", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Bubbles.mp4`,
      },
    },
  },
  {
    id: "modern-cube-wall",
    name: "Cube Wall",
    description: "Geometric cube patterns with depth and dimension",
    thumbnail: `${thumbnailsPath}/Cube_Wall_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 9800,
    rating: 4.7,
    tags: ["geometric", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Cube_Wall.mp4`,
      },
    },
  },
  {
    id: "modern-dot-matrix",
    name: "Dot Matrix",
    description: "Elegant dot patterns with smooth animations",
    thumbnail: `${thumbnailsPath}/Dot_Matrix_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 8900,
    rating: 4.6,
    tags: ["dots", "modern", "minimal"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Dot_Matrix.mp4`,
      },
    },
  },
  {
    id: "modern-event-horizon",
    name: "Event Horizon",
    description: "Abstract cosmic event with mesmerizing visuals",
    thumbnail: `${thumbnailsPath}/Event_Horizon_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 10300,
    rating: 4.8,
    tags: ["space", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Event_Horizon.mp4`,
      },
    },
  },
  {
    id: "modern-fractal-flower",
    name: "Fractal Flower",
    description: "Hypnotic fractal patterns blooming with color",
    thumbnail: `${thumbnailsPath}/Fractal_Flower_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 11200,
    rating: 4.7,
    tags: ["fractals", "modern", "colorful"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Fractal_Flower.mp4`,
      },
    },
  },
  {
    id: "modern-inferno",
    name: "Inferno",
    description: "Dynamic fire-like abstract visuals with deep warmth",
    thumbnail: `${thumbnailsPath}/Inferno_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 9400,
    rating: 4.5,
    tags: ["fire", "modern", "warm"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Inferno.mp4`,
      },
    },
  },
  {
    id: "modern-jade-tunnel",
    name: "Jade Tunnel",
    description: "Immersive tunnel experience with jade green hues",
    thumbnail: `${thumbnailsPath}/Jade_Tunnel_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 9100,
    rating: 4.6,
    tags: ["tunnel", "modern", "immersive"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Jade_Tunnel.mp4`,
      },
    },
  },
  {
    id: "modern-landscape-waves",
    name: "Landscape Waves",
    description: "Flowing waves of abstract landscape forms",
    thumbnail: `${thumbnailsPath}/Landscape_Waves_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 8300,
    rating: 4.5,
    tags: ["waves", "modern", "landscape"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Landscape_Waves.mp4`,
      },
    },
  },
  {
    id: "modern-neon-slide",
    name: "Neon Slide",
    description: "Smooth sliding neon elements in motion",
    thumbnail: `${thumbnailsPath}/Neon_Slide_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 10700,
    rating: 4.7,
    tags: ["neon", "modern", "motion"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Neon_Slide.mp4`,
      },
    },
  },
  {
    id: "modern-neon-stars",
    name: "Neon Stars",
    description: "Glowing neon star patterns in cosmic space",
    thumbnail: `${thumbnailsPath}/Neon_Stars_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 11800,
    rating: 4.8,
    tags: ["stars", "modern", "space"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Neon_Stars.mp4`,
      },
    },
  },
  {
    id: "modern-neon-tunnel",
    name: "Neon Tunnel",
    description: "Immersive tunnel with vibrant neon lighting",
    thumbnail: `${thumbnailsPath}/Neon_Tunnel_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 12300,
    rating: 4.9,
    tags: ["tunnel", "modern", "neon"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Neon_Tunnel.mp4`,
      },
    },
  },
  {
    id: "modern-space-grid",
    name: "Space Grid",
    description: "Futuristic grid patterns in cosmic space",
    thumbnail: `${thumbnailsPath}/Space_Grid_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 9600,
    rating: 4.6,
    tags: ["grid", "modern", "space"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Space_Grid.mp4`,
      },
    },
  },
  {
    id: "modern-sparkle",
    name: "Sparkle",
    description: "Elegant sparkling particles in gentle motion",
    thumbnail: `${thumbnailsPath}/Sparkle_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 10500,
    rating: 4.7,
    tags: ["sparkle", "modern", "particles"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Sparkle.mp4`,
      },
    },
  },
  {
    id: "modern-spotlight",
    name: "Spotlight",
    description: "Dynamic spotlight effects with smooth transitions",
    thumbnail: `${thumbnailsPath}/Spotlight_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 8800,
    rating: 4.5,
    tags: ["light", "modern", "spotlight"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Spotlight.mp4`,
      },
    },
  },
  {
    id: "modern-torus",
    name: "Torus",
    description: "Mesmerizing torus geometric form in motion",
    thumbnail: `${thumbnailsPath}/Torus_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 9200,
    rating: 4.6,
    tags: ["geometric", "modern", "3D"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Torus.mp4`,
      },
    },
  },
  {
    id: "modern-turbulence",
    name: "Turbulence",
    description: "Fluid dynamics creating abstract turbulent patterns",
    thumbnail: `${thumbnailsPath}/Turbulence_thumbnail.jpg`,
    author: "Alex Design",
    downloads: 8700,
    rating: 4.5,
    tags: ["fluid", "modern", "abstract"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Turbulence.mp4`,
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
    thumbnail: `${thumbnailsPath}/Beach_House_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8700,
    rating: 4.6,
    tags: ["nature", "beach", "water"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Beach_House.mp4`,
      },
    },
  },
  {
    id: "nature-big-sky",
    name: "Big Sky",
    description: "Expansive sky view with stunning cloud formations",
    thumbnail: `${thumbnailsPath}/Big_Sky_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7200,
    rating: 4.5,
    tags: ["nature", "sky", "clouds"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Big_Sky.mp4`,
      },
    },
  },
  {
    id: "nature-forest-sunbeams",
    name: "Forest Sunbeams",
    description: "Magical forest with sunlight filtering through trees",
    thumbnail: `${thumbnailsPath}/Forest_Sunbeams_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8900,
    rating: 4.7,
    tags: ["nature", "forest", "sunlight"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Forest_Sunbeams.mp4`,
      },
    },
  },
  {
    id: "nature-kitten",
    name: "Kitten",
    description: "Adorable kitten with playful charm",
    thumbnail: `${thumbnailsPath}/Kitten_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 9500,
    rating: 4.9,
    tags: ["nature", "animal", "cute"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Kitten.mp4`,
      },
    },
  },
  {
    id: "nature-kyoto-rain",
    name: "Kyoto Rain",
    description: "Atmospheric rainy scene in tranquil Kyoto",
    thumbnail: `${thumbnailsPath}/Kyoto_Rain_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7800,
    rating: 4.6,
    tags: ["nature", "rain", "japan"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Kyoto_Rain.mp4`,
      },
    },
  },
  {
    id: "nature-sakura",
    name: "Sakura",
    description: "Beautiful cherry blossoms in full bloom",
    thumbnail: `${thumbnailsPath}/Sakura_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8300,
    rating: 4.7,
    tags: ["nature", "flowers", "spring"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Sakura.mp4`,
      },
    },
  },
  {
    id: "nature-midnight-grove",
    name: "Midnight Grove",
    description: "Mystical forest at night with enchanting atmosphere",
    thumbnail: `${thumbnailsPath}/Midnight_Grove_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7900,
    rating: 4.6,
    tags: ["nature", "forest", "night"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Midnight_Grove.mp4`,
      },
    },
  },
  {
    id: "nature-moonlight-campfire",
    name: "Moonlight Campfire",
    description: "Cozy campfire under the moonlit sky",
    thumbnail: `${thumbnailsPath}/Moonlight_Campfire_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8100,
    rating: 4.7,
    tags: ["nature", "night", "fire"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Moonlight_Campfire.mp4`,
      },
    },
  },
  {
    id: "nature-mushrooms",
    name: "Mushrooms",
    description: "Enchanting mushrooms with magical forest ambiance",
    thumbnail: `${thumbnailsPath}/Mushrooms_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7300,
    rating: 4.5,
    tags: ["nature", "mushrooms", "forest"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Mushrooms.mp4`,
      },
    },
  },
  {
    id: "nature-nebula",
    name: "Nebula",
    description: "Cosmic nebula with vibrant space colors",
    thumbnail: `${thumbnailsPath}/Nebula_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 9100,
    rating: 4.8,
    tags: ["nature", "space", "cosmos"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Nebula.mp4`,
      },
    },
  },
  {
    id: "nature-peaceful-river",
    name: "Peaceful River",
    description: "Gentle flowing river with calming natural sounds",
    thumbnail: `${thumbnailsPath}/Peaceful_River_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8200,
    rating: 4.6,
    tags: ["nature", "water", "river"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Peaceful_River.mp4`,
      },
    },
  },
  {
    id: "nature-poolside",
    name: "Poolside",
    description: "Relaxing poolside view with sparkling water",
    thumbnail: `${thumbnailsPath}/Poolside_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7600,
    rating: 4.5,
    tags: ["nature", "pool", "relax"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Poolside.mp4`,
      },
    },
  },
  {
    id: "nature-savannah-sunset",
    name: "Savannah Sunset",
    description: "Golden sunset over the vast African savannah",
    thumbnail: `${thumbnailsPath}/Savannah_Sunset_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8700,
    rating: 4.7,
    tags: ["nature", "sunset", "africa"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Savannah_Sunset.mp4`,
      },
    },
  },
  {
    id: "nature-stormy-sky",
    name: "Stormy Sky",
    description: "Dramatic clouds with atmospheric storm energy",
    thumbnail: `${thumbnailsPath}/Stormy_Sky_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 7500,
    rating: 4.6,
    tags: ["nature", "storm", "clouds"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Stormy_Sky.mp4`,
      },
    },
  },
  {
    id: "nature-sunset-beach",
    name: "Sunset Beach",
    description: "Beautiful sunset over tropical beach paradise",
    thumbnail: `${thumbnailsPath}/Sunset_Beach_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 9800,
    rating: 4.9,
    tags: ["nature", "beach", "sunset"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Sunset_Beach.mp4`,
      },
    },
  },
  {
    id: "nature-tokyo-spring",
    name: "Tokyo Spring",
    description: "Vibrant spring scenes from Tokyo with blossoms",
    thumbnail: `${thumbnailsPath}/Tokyo_Spring_thumbnail.jpg`,
    author: "Emma Nature",
    downloads: 8500,
    rating: 4.7,
    tags: ["nature", "japan", "spring"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Tokyo_Spring.mp4`,
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
    thumbnail: `${thumbnailsPath}/Astral_Staircase_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 11200,
    rating: 4.9,
    tags: ["cyberpunk", "space", "futuristic"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Astral_Staircase.mp4`,
      },
    },
  },
  {
    id: "cyber-arches",
    name: "Cyber Arches",
    description: "Futuristic architectural arches with neon lighting",
    thumbnail: `${thumbnailsPath}/Cyber_Arches_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 9400,
    rating: 4.7,
    tags: ["cyberpunk", "architecture", "neon"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Cyber_Arches.mp4`,
      },
    },
  },
  {
    id: "cyber-corridor",
    name: "Cyber Corridor",
    description: "High-tech corridor with flowing digital elements",
    thumbnail: `${thumbnailsPath}/Cyber_Corridor_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 10300,
    rating: 4.8,
    tags: ["cyberpunk", "tech", "digital"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Cyber_Corridor.mp4`,
      },
    },
  },
  {
    id: "cyber-dark-lightning",
    name: "Dark Lightning",
    description: "Electric energy with dark atmospheric visuals",
    thumbnail: `${thumbnailsPath}/Dark_Lightning_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 8700,
    rating: 4.6,
    tags: ["cyberpunk", "energy", "dark"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Dark_Lightning.mp4`,
      },
    },
  },
  {
    id: "cyber-night-city",
    name: "Night City",
    description: "Futuristic cityscape with neon lights",
    thumbnail: `${thumbnailsPath}/Night_City_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 12500,
    rating: 4.9,
    tags: ["cyberpunk", "city", "night"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Night_City.mp4`,
      },
    },
  },
  {
    id: "cyber-neo",
    name: "Neo",
    description: "Digital matrix-inspired visual effect",
    thumbnail: `${thumbnailsPath}/Neo_thumbnail.jpg`,
    author: "Neo Digital",
    downloads: 9800,
    rating: 4.7,
    tags: ["cyberpunk", "matrix", "digital"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Neo.mp4`,
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
    thumbnail: `${thumbnailsPath}/Christmas_Ornaments_thumbnail.jpg`,
    author: "Marina Waves",
    downloads: 7800,
    rating: 4.6,
    tags: ["winter", "christmas", "holiday"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Christmas_Ornaments.mp4`,
      },
    },
  },
  {
    id: "winter-sleigh",
    name: "Sleigh Ride",
    description: "Nostalgic winter sleigh ride through snowy landscape",
    thumbnail: `${thumbnailsPath}/Sleigh_Ride_thumbnail.jpg`,
    author: "Marina Waves",
    downloads: 6500,
    rating: 4.5,
    tags: ["winter", "sleigh", "snow"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Sleigh_Ride.mp4`,
      },
    },
  },
  {
    id: "winter-snow-globe",
    name: "Snow Globe",
    description: "Magical snow globe with whimsical winter scene",
    thumbnail: `${thumbnailsPath}/Snow_Globe_thumbnail.jpg`,
    author: "Marina Waves",
    downloads: 8900,
    rating: 4.7,
    tags: ["winter", "globe", "magical"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Snow_Globe.mp4`,
      },
    },
  },
  {
    id: "winter-snowflakes",
    name: "Snowflakes",
    description: "Beautiful falling snowflakes with winter tranquility",
    thumbnail: `${thumbnailsPath}/Snowflakes_thumbnail.jpg`,
    author: "Marina Waves",
    downloads: 9200,
    rating: 4.8,
    tags: ["winter", "snow", "gentle"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Snowflakes.mp4`,
      },
    },
  },
  {
    id: "winter-wonderland",
    name: "Winter Wonderland",
    description: "Serene winter landscape with magical atmosphere",
    thumbnail: `${thumbnailsPath}/Winter_Wonderland_thumbnail.jpg`,
    author: "Marina Waves",
    downloads: 10500,
    rating: 4.9,
    tags: ["winter", "landscape", "wonderland"],
    theme: {
      background: {
        type: "video",
        value: `${awsS3}/Winter_Wonderland.mp4`,
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