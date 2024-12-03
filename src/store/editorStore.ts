import { create } from 'zustand';
import type { EditorState, Block, UserProfile, Theme, Background } from '../types/editor';

interface EditorStore extends EditorState {
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: Block) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, block: Partial<Block>) => void;
  reorderBlocks: (blocks: Block[]) => void;
  updateTheme: (theme: Partial<Theme>) => void;
  setActivePanel: (panel: string) => void;
  setBackground: (background: Background) => void;
}

const defaultProfile: UserProfile = {
  name: 'Alex Thompson',
  title: 'Web3 Developer & Digital Creator',
  bio: 'Building the future of decentralized applications. Passionate about blockchain, NFTs, and creating meaningful digital experiences. Let\'s connect and build something amazing together! 🚀',
  photoUrl: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&q=80&fit=crop',
};

const initialState: EditorState = {
  profile: defaultProfile,
  blocks: [
    {
      id: '1',
      type: 'link',
      platform: 'twitter',
      url: 'https://twitter.com/alexthompson',
      label: 'Follow me on Twitter',
    },
    {
      id: '2',
      type: 'link',
      platform: 'github',
      url: 'https://github.com/alexthompson',
      label: 'Check out my code',
    },
    {
      id: '3',
      type: 'link',
      platform: 'lens',
      url: 'https://lens.xyz/alexthompson',
      label: 'Connect on Lens',
    },
  ],
  theme: {
    buttonStyle: 3,
    containerStyle: 0,
    background: {
      type: 'image',
      value: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
    },
    buttonColor: '#3b82f6',
    containerColor: '#ffffff',
    fontFamily: 'Inter',
    fontSize: '16px',
    fontColor: '#000000',
    transparency: 100,
    buttonEffect: 0,
    particlesEffect: 0,
    heroEffect: 0,
  },
  activePanel: 'profile',
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...initialState,
  setProfile: (profile) => set({ profile }),
  addBlock: (block) => set((state) => ({ 
    blocks: [...state.blocks, block],
  })),
  removeBlock: (id) => set((state) => ({
    blocks: state.blocks.filter((block) => block.id !== id),
  })),
  updateBlock: (id, updatedBlock) => set((state) => ({
    blocks: state.blocks.map((block) =>
      block.id === id ? { ...block, ...updatedBlock } : block
    ),
  })),
  reorderBlocks: (blocks) => set({ blocks }),
  updateTheme: (theme) => set((state) => ({
    theme: { ...state.theme, ...theme },
  })),
  setActivePanel: (activePanel) => set({ activePanel }),
  setBackground: (background) => set((state) => ({
    theme: { ...state.theme, background },
  })),
}));