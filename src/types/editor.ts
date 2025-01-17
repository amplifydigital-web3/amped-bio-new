import type { AuthUser } from '../types/auth';

export type UserProfile = {
  name: string;
  title: string;
  bio: string;
  photoUrl: string;
};

export type LinkBlock = {
  id: string;
  type: 'link';
  platform: string;
  url: string;
  label: string;
};

export type MediaBlock = {
  id: string;
  type: 'media';
  mediaType?: 'spotify' | 'instagram' | 'youtube' | 'twitter' | 'token-price' | 'nft-collection' | 'uniswap' | 'substack';
  content?: string;
  platform: string;
  url: string;
  label: string;
};

export type TextBlock = {
  id: string;
  type: 'text';
  content: string;
};

export type Block = LinkBlock | MediaBlock | TextBlock;

export type Background = {
  type: 'color' | 'image' | 'video';
  value: string;
  label?: string;
};

export type Theme = {
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

export type EditorState = {
  user: AuthUser;
  profile: UserProfile;
  blocks: Block[];
  theme: Theme;
  activePanel: string;
};