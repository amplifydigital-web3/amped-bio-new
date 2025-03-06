import type { MarketplaceTheme, Collection } from '../types/editor';

// Modern & Minimal Collection Themes
const modernThemes: MarketplaceTheme[] = [
  {
    id: 'modern-1',
    name: 'Clean Slate',
    description: 'Minimalist design with a focus on typography and whitespace',
    thumbnail: 'https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?w=400&h=300&fit=crop',
    author: 'Alex Design',
    downloads: 12500,
    rating: 4.8,
    tags: ['minimal', 'modern', 'clean'],
    theme: {
      buttonStyle: 4,
      containerStyle: 1,
      background: {
        type: 'color',
        value: 'linear-gradient(to right, #E0EAFC, #CFDEF3)',
      },
      buttonColor: '#3B82F6',
      containerColor: '#ffffff',
      fontFamily: 'Inter',
      fontSize: '16px',
      fontColor: '#1F2937',
      transparency: 90,
      buttonEffect: 1,
      particlesEffect: 0,
      heroEffect: 0,
    }
  },
  {
    id: 'modern-2',
    name: 'Glass Morphism',
    description: 'Modern glass effect with subtle blur and transparency',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=300&fit=crop',
    author: 'Alex Design',
    downloads: 9800,
    rating: 4.7,
    tags: ['glass', 'modern', 'blur'],
    theme: {
      buttonStyle: 4,
      containerStyle: 1,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
      },
      buttonColor: '#ffffff20',
      containerColor: '#ffffff',
      fontFamily: 'Poppins',
      fontSize: '16px',
      fontColor: '#000000',
      transparency: 70,
      buttonEffect: 2,
      particlesEffect: 1,
      heroEffect: 1,
    }
  }
];

// Nature & Organic Collection Themes
const natureThemes: MarketplaceTheme[] = [
  {
    id: 'nature-1',
    name: 'Forest Breeze',
    description: 'Organic design inspired by natural elements',
    thumbnail: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop',
    author: 'Emma Nature',
    downloads: 8700,
    rating: 4.6,
    tags: ['nature', 'organic', 'green'],
    theme: {
      buttonStyle: 2,
      containerStyle: 7,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07',
      },
      buttonColor: '#059669',
      containerColor: '#ffffff',
      fontFamily: 'Montserrat',
      fontSize: '16px',
      fontColor: '#064E3B',
      transparency: 85,
      buttonEffect: 3,
      particlesEffect: 4,
      heroEffect: 2,
    }
  },
  {
    id: 'nature-2',
    name: 'Earth Tones',
    description: 'Warm, earthy colors with organic patterns',
    thumbnail: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=300&fit=crop',
    author: 'Emma Nature',
    downloads: 7200,
    rating: 4.5,
    tags: ['nature', 'earth', 'warm'],
    theme: {
      buttonStyle: 3,
      containerStyle: 5,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1501854140801-50d01698950b',
      },
      buttonColor: '#92400E',
      containerColor: '#ffffff',
      fontFamily: 'Open Sans',
      fontSize: '16px',
      fontColor: '#78350F',
      transparency: 95,
      buttonEffect: 7,
      particlesEffect: 0,
      heroEffect: 4,
    }
  }
];

// Cyberpunk Collection Themes
const cyberpunkThemes: MarketplaceTheme[] = [
  {
    id: 'cyber-1',
    name: 'Neon Future',
    description: 'Bold neon accents with futuristic elements',
    thumbnail: 'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=400&h=300&fit=crop',
    author: 'Neo Digital',
    downloads: 11200,
    rating: 4.9,
    tags: ['cyberpunk', 'neon', 'future'],
    theme: {
      buttonStyle: 6,
      containerStyle: 4,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2',
      },
      buttonColor: '#EC4899',
      containerColor: '#000000',
      fontFamily: 'Inter',
      fontSize: '16px',
      fontColor: '#ffffff',
      transparency: 80,
      buttonEffect: 9,
      particlesEffect: 6,
      heroEffect: 7,
    }
  },
  {
    id: 'cyber-2',
    name: 'Digital Rain',
    description: 'Matrix-inspired design with digital elements',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=300&fit=crop',
    author: 'Neo Digital',
    downloads: 9400,
    rating: 4.7,
    tags: ['cyberpunk', 'matrix', 'digital'],
    locked: true,
    nftRequirement: {
      contractAddress: '0x456...',
      chainId: 1,
      minBalance: 1,
      name: 'Cyberpunk NFT',
      image: 'https://images.unsplash.com/photo-1515630278258-407f66498911?w=100&h=100&fit=crop',
      price: '0.15 ETH',
      marketplace: 'https://opensea.io'
    },
    theme: {
      buttonStyle: 5,
      containerStyle: 2,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5',
      },
      buttonColor: '#10B981',
      containerColor: '#000000',
      fontFamily: 'Roboto',
      fontSize: '16px',
      fontColor: '#ffffff',
      transparency: 75,
      buttonEffect: 8,
      particlesEffect: 6,
      heroEffect: 9,
    }
  }
];

// Ocean Collection Themes
const oceanThemes: MarketplaceTheme[] = [
  {
    id: 'ocean-1',
    name: 'Deep Blue',
    description: 'Serene ocean-inspired design with fluid animations',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=300&fit=crop',
    author: 'Marina Waves',
    downloads: 7800,
    rating: 4.6,
    tags: ['ocean', 'blue', 'calm'],
    theme: {
      buttonStyle: 7,
      containerStyle: 1,
      background: {
        type: 'video',
        value: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
      },
      buttonColor: '#0EA5E9',
      containerColor: '#ffffff',
      fontFamily: 'Poppins',
      fontSize: '16px',
      fontColor: '#0C4A6E',
      transparency: 85,
      buttonEffect: 5,
      particlesEffect: 4,
      heroEffect: 6,
    }
  },
  {
    id: 'ocean-2',
    name: 'Coastal Breeze',
    description: 'Light and airy design with coastal elements',
    thumbnail: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=400&h=300&fit=crop',
    author: 'Marina Waves',
    downloads: 6500,
    rating: 4.5,
    tags: ['ocean', 'coastal', 'light'],
    theme: {
      buttonStyle: 1,
      containerStyle: 7,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      },
      buttonColor: '#0891B2',
      containerColor: '#ffffff',
      fontFamily: 'Open Sans',
      fontSize: '16px',
      fontColor: '#164E63',
      transparency: 90,
      buttonEffect: 4,
      particlesEffect: 2,
      heroEffect: 3,
    }
  }
];

// Red Bull Collection Themes
const redBullThemes: MarketplaceTheme[] = [
  {
    id: 'redbull-1',
    name: 'Racing Spirit',
    description: 'Dynamic and energetic design inspired by F1 racing',
    thumbnail: 'https://images.unsplash.com/photo-1541773367336-d3f7c69deef4?w=400&h=300&fit=crop',
    author: 'Red Bull Creative',
    downloads: 14800,
    rating: 4.9,
    tags: ['sports', 'racing', 'dynamic'],
    theme: {
      buttonStyle: 8,
      containerStyle: 2,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1533130061792-64b345e4a833',
      },
      buttonColor: '#DB0A40',
      containerColor: '#ffffff',
      fontFamily: 'Inter',
      fontSize: '16px',
      fontColor: '#1E2127',
      transparency: 90,
      buttonEffect: 8,
      particlesEffect: 2,
      heroEffect: 4,
    }
  },
  {
    id: 'redbull-2',
    name: 'Adrenaline Rush',
    description: 'Bold and energetic theme with racing-inspired elements',
    thumbnail: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=400&h=300&fit=crop',
    author: 'Red Bull Creative',
    downloads: 11200,
    rating: 4.7,
    tags: ['sports', 'energy', 'bold'],
    locked: true,
    nftRequirement: {
      contractAddress: '0x789...',
      chainId: 1,
      minBalance: 1,
      name: 'Red Bull Racing NFT',
      image: 'https://images.unsplash.com/photo-1541773367336-d3f7c69deef4?w=100&h=100&fit=crop',
      price: '0.2 ETH',
      marketplace: 'https://opensea.io'
    },
    theme: {
      buttonStyle: 6,
      containerStyle: 4,
      background: {
        type: 'video',
        value: 'https://assets.mixkit.co/videos/preview/mixkit-race-car-driving-fast-404-large.mp4',
      },
      buttonColor: '#1E2127',
      containerColor: '#ffffff',
      fontFamily: 'Inter',
      fontSize: '16px',
      fontColor: '#1E2127',
      transparency: 85,
      buttonEffect: 5,
      particlesEffect: 1,
      heroEffect: 7,
    }
  }
];

// Chanel Collection Themes
const chanelThemes: MarketplaceTheme[] = [
  {
    id: 'chanel-1',
    name: 'Timeless Elegance',
    description: 'Classic black and white design with luxurious details',
    thumbnail: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=300&fit=crop',
    author: 'Chanel Digital',
    downloads: 16500,
    rating: 4.9,
    tags: ['luxury', 'fashion', 'elegant'],
    theme: {
      buttonStyle: 2,
      containerStyle: 5,
      background: {
        type: 'color',
        value: 'linear-gradient(45deg, #000000, #1a1a1a)',
      },
      buttonColor: '#000000',
      containerColor: '#ffffff',
      fontFamily: 'Montserrat',
      fontSize: '16px',
      fontColor: '#000000',
      transparency: 95,
      buttonEffect: 2,
      particlesEffect: 9,
      heroEffect: 1,
    }
  },
  {
    id: 'chanel-2',
    name: 'Parisian Chic',
    description: 'Sophisticated design with iconic Chanel elements',
    thumbnail: 'https://images.unsplash.com/photo-1470338745628-171cf53de3a8?w=400&h=300&fit=crop',
    author: 'Chanel Digital',
    downloads: 13800,
    rating: 4.8,
    tags: ['fashion', 'luxury', 'paris'],
    locked: true,
    nftRequirement: {
      contractAddress: '0xabc...',
      chainId: 1,
      minBalance: 1,
      name: 'Chanel Exclusive NFT',
      image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=100&h=100&fit=crop',
      price: '0.25 ETH',
      marketplace: 'https://opensea.io'
    },
    theme: {
      buttonStyle: 1,
      containerStyle: 7,
      background: {
        type: 'image',
        value: 'https://images.unsplash.com/photo-1470338745628-171cf53de3a8',
      },
      buttonColor: '#000000',
      containerColor: '#ffffff',
      fontFamily: 'Montserrat',
      fontSize: '16px',
      fontColor: '#000000',
      transparency: 90,
      buttonEffect: 3,
      particlesEffect: 2,
      heroEffect: 5,
    }
  }
];

// Define Collections
const modernCollection: Collection = {
  id: 'modern',
  name: 'Modern & Minimal',
  description: 'Clean, contemporary designs with a focus on simplicity and elegance. Perfect for personal branding and professional portfolios.',
  collaborator: {
    name: 'Alex Design',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop',
    url: 'https://twitter.com/alexdesign',
    bio: 'UI/UX Designer specializing in minimal interfaces',
  },
  themeCount: modernThemes.length,
  downloads: 24680,
  rating: 4.8,
  themes: modernThemes,
};

const natureCollection: Collection = {
  id: 'nature',
  name: 'Nature & Organic',
  description: 'Inspired by the natural world, featuring organic textures, earthy colors, and flowing animations.',
  collaborator: {
    name: 'Emma Nature',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop',
    url: 'https://twitter.com/emmanature',
    bio: 'Environmental artist and digital designer',
  },
  themeCount: natureThemes.length,
  downloads: 18450,
  rating: 4.7,
  themes: natureThemes,
};

const cyberpunkCollection: Collection = {
  id: 'cyber',
  name: 'Cyberpunk & Futuristic',
  description: 'Bold, neon-infused designs that push the boundaries of digital aesthetics. For the forward-thinking creator.',
  collaborator: {
    name: 'Neo Digital',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop',
    url: 'https://twitter.com/neodigital',
    bio: 'Digital artist exploring the intersection of art and technology',
  },
  themeCount: cyberpunkThemes.length,
  downloads: 21340,
  rating: 4.9,
  themes: cyberpunkThemes,
};

const oceanCollection: Collection = {
  id: 'ocean',
  name: 'Ocean & Coastal',
  description: 'Serene and calming designs inspired by the sea, featuring fluid animations and coastal color palettes.',
  collaborator: {
    name: 'Marina Waves',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop',
    url: 'https://twitter.com/marinawaves',
    bio: 'Marine photographer and digital creator',
  },
  themeCount: oceanThemes.length,
  downloads: 15780,
  rating: 4.6,
  themes: oceanThemes,
};

const redBullCollection: Collection = {
  id: 'redbull',
  name: 'Red Bull Racing',
  description: 'High-energy themes inspired by motorsports and extreme athletics. Perfect for sports and energy-driven brands.',
  collaborator: {
    name: 'Red Bull Creative',
    avatar: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=64&h=64&fit=crop',
    url: 'https://twitter.com/redbullracing',
    bio: 'Official Red Bull Racing digital design team',
  },
  themeCount: redBullThemes.length,
  downloads: 26000,
  rating: 4.8,
  themes: redBullThemes,
};

const chanelCollection: Collection = {
  id: 'chanel',
  name: 'Chanel Luxe',
  description: 'Timeless and elegant themes inspired by haute couture. Perfect for luxury brands and sophisticated personal brands.',
  collaborator: {
    name: 'Chanel Digital',
    avatar: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=64&h=64&fit=crop',
    url: 'https://twitter.com/chanel',
    bio: 'Chanel digital experience design team',
  },
  themeCount: chanelThemes.length,
  downloads: 30200,
  rating: 4.9,
  themes: chanelThemes,
};

// Export collections and themes
export const collections: Collection[] = [
  modernCollection,
  natureCollection,
  cyberpunkCollection,
  oceanCollection,
  redBullCollection,
  chanelCollection,
];

export const marketplaceThemes = collections.flatMap(c => c.themes);