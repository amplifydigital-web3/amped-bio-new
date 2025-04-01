export type UserProfile = {
  name: string;
  onelink: string;
  email: string;
  bio: string;
  photoUrl?: string;
  photoCmp?: string;
};

export type LinkBlock = {
  id: number;
  type: 'link';
  platform: string;
  url: string;
  label: string;
};

export type MediaBlock = {
  id: number;
  type: 'media';
  content?: string;
  platform: string;
  url: string;
  label: string;
};

export type TextBlock = {
  id: number;
  type: 'text';
  content: string;
  platform: string;
};

export type Block = LinkBlock | MediaBlock | TextBlock;

export type Background = {
  type: 'color' | 'image' | 'video';
  value: string;
  label?: string;
};

export type ThemeConfig = {
  buttonStyle: number;
  containerStyle: number;
  background: Background;
  buttonColor: string;
  containerColor: string;
  fontFamily: string;
  fontSize: string;
  fontColor: string;
  transparency: number;
  buttonEffect: number;
  particlesEffect: number;
  heroEffect: number;
};

export type Theme = {
  id: number;
  name: string;
  share_level: string;
  share_config: object;
  config: ThemeConfig;
};

export interface GalleryImage {
  url: string;
  type: string;
}

export interface NFTRequirement {
  contractAddress: string;
  chainId: number;
  minBalance: number;
  name: string;
  image: string;
  price: string;
  marketplace: string;
}

export interface MarketplaceTheme {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  author: string;
  downloads: number;
  rating: number;
  tags: string[];
  theme: ThemeConfig;
  locked?: boolean;
  nftRequirement?: NFTRequirement;
}

export interface Collaborator {
  name: string;
  avatar: string;
  url: string;
  bio: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  collaborator: Collaborator;
  themeCount: number;
  downloads: number;
  rating: number;
  themes: MarketplaceTheme[];
}

export type EditorState = {
  profile: UserProfile;
  blocks: Block[];
  theme: Theme;
  activePanel: string;
  gallery: GalleryImage[];
  marketplaceView: 'grid' | 'list';
  marketplaceFilter: string;
  marketplaceSort: 'popular' | 'newest' | 'rating';
  connectedWallet?: string;
  selectedPoolId: string | null;
};