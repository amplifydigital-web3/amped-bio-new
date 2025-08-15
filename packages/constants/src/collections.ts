export interface MarketplaceTheme {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tags: string[];
  theme: import("./theme").ThemeConfig;
  user_id?: number | null; // For server themes, null means admin theme
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
