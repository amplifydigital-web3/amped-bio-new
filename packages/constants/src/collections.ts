interface Background {
  id?: string;
  type: "color" | "image" | "video";
  value: string;
  label?: string;
  thumbnail?: string;
}

interface ThemeConfig {
  buttonStyle?: number;
  containerStyle?: number;
  background?: Background;
  buttonColor?: string;
  containerColor?: string;
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  transparency?: number;
  buttonEffect?: number;
  particlesEffect?: number;
  heroEffect?: number;
}

interface MarketplaceTheme {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tags: string[];
  theme: ThemeConfig;
  locked?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  themeCount: number;
  themes?: MarketplaceTheme[]; // Optional - only present for hardcoded collections
  isServer?: boolean;
  categoryImage?: {
    id: number;
    url: string | null;
    [key: string]: any;
  } | null;
}
