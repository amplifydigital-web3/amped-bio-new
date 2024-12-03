export interface UserProfile {
  name: string;
  title: string;
  bio: string;
  photoUrl: string;
}

export interface LinkBlock {
  id: string;
  type: 'link';
  platform: string;
  url: string;
  label: string;
}

export interface MediaBlock {
  id: string;
  type: 'media';
  mediaType: 'spotify' | 'instagram' | 'youtube' | 'twitter';
  content: string;
}

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export type Block = LinkBlock | MediaBlock | TextBlock;

export interface Background {
  type: 'color' | 'image' | 'video';
  value: string;
  label?: string;
}

export interface Theme {
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
}

export interface EditorState {
  profile: UserProfile;
  blocks: Block[];
  theme: Theme;
  activePanel: string;
}