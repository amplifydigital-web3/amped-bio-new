import { create } from 'zustand';
import type {
  EditorState,
  Block,
  UserProfile,
  Theme,
  ThemeConfig,
  Background,
  GalleryImage,
  MarketplaceTheme,
} from '../types/editor';
import { persist, PersistOptions } from 'zustand/middleware';
import {
  editUser,
  editTheme,
  editBlocks,
  deleteBlock,
  getOnelink,
} from '../api';
import initialState, { defaultAuthUser } from './defaults';
import { useAuthStore } from './authStore';
import toast from 'react-hot-toast';

interface EditorStore extends EditorState {
  changes: boolean;
  setUser: (onelink: string) => Promise<any>;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: Block) => void;
  removeBlock: (id: number) => void;
  updateBlock: (id: number, block: Partial<Block>) => void;
  reorderBlocks: (blocks: Block[]) => void;
  updateThemeConfig: (theme: Partial<ThemeConfig>) => void;
  setActivePanel: (panel: string) => void;
  setBackground: (background: Background) => void;
  saveChanges: () => void;
  setDefault: () => void;
  addToGallery: (image: GalleryImage) => void;
  removeFromGallery: (url: string) => void;
  setMarketplaceView: (view: 'grid' | 'list') => void;
  setMarketplaceFilter: (filter: string) => void;
  setMarketplaceSort: (sort: 'popular' | 'newest' | 'rating') => void;
  applyTheme: (theme: Theme) => void;
  selectedPoolId: string | null;
  setSelectedPoolId: (id: string | null) => void;
}

type EditorPersistOptions = PersistOptions<EditorStore>;

// const persistOptions: EditorPersistOptions = {
//   name: 'editor-storage'
// };

export const useEditorStore = create<EditorStore>()((set) => ({
  changes: false,
  ...initialState,

  // SetUser will fetch all user data (profile, blocks, theme) and apply all
  setUser: async (onelink: string) => {
    try {
      const userData = await getOnelink(onelink);
      if (!userData) {
        console.error('User not found:', onelink);
        return;
      }
      const { user, theme, blocks: blocks_raw } = userData;
      const { name, email, description, image } = user;

      set({
        profile: { name, onelink, email, bio: description, photoUrl: image },
      });
      set({ theme: { ...initialState.theme, ...theme } });
      const blocks = blocks_raw
        .sort((a, b) => a.order - b.order)
        .map(({ id, type, config }) => {
          return { id, type, ...config };
        });
      set({ blocks: blocks });
      return userData;
    } catch (error) {
      console.error('Error getting user:', error);
      return;
    }
  },

  // setProfile
  setProfile: (profile) => set({ profile, changes: true }),

  // addBlock
  addBlock: (block: Block) =>
    set((state) => ({
      blocks: [...state.blocks, block],
      changes: true,
    })),

  // removeBlock will attempt to make a delete request to the server to prevent block ordering confusion on save
  removeBlock: async (id: number) => {
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === defaultAuthUser) {
        console.error('Remove Block Error: No user logged in');
        toast.error('Authentication error');
        return;
      }

      await deleteBlock(id, authUser.id);

      set((state) => ({
        blocks: state.blocks.filter((block) => block.id !== id),
      }));
    } catch (error) {
      console.log('error deleting block', error);
    }
  },

  // updateBlock will do a partial update a block in the list of blocks
  updateBlock: (id: number, updatedBlock: Partial<Block>) =>
    set(
      (state) =>
      ({
        blocks: state.blocks.map((block) =>
          block.id === id ? { ...block, ...updatedBlock } : block
        ),
        changes: true,
      } as Partial<EditorStore>)
    ),

  // reorderBlock
  reorderBlocks: (blocks: Block[]) => set({ blocks, changes: true }),
  // updateThemeConfig will update the theme config and preserve prev values not changed
  updateThemeConfig: (config) =>
    set((state) => ({
      theme: { ...state.theme, config: { ...state.theme.config, ...config } },
      changes: true,
    })),

  // setActivePanel used for changing sidebar panels
  setActivePanel: (activePanel: string) => set({ activePanel }),

  // setBackground
  setBackground: (background: Background) =>
    set((state) => ({
      theme: {
        ...state.theme,
        config: { ...state.theme.config, background },
      },
      changes: true,
    })),

  // addToGallery
  addToGallery: (image) =>
    set((state) => ({
      gallery: [...state.gallery, image],
    })),

  // removeFromGallery
  removeFromGallery: (url) =>
    set((state) => ({
      gallery: state.gallery.filter((image) => image.url !== url),
    })),
  setMarketplaceView: (marketplaceView) => set({ marketplaceView }),
  setMarketplaceFilter: (marketplaceFilter) => set({ marketplaceFilter }),
  setMarketplaceSort: (marketplaceSort) => set({ marketplaceSort }),

  // This should be removed and replace usage with updateThemeConfig
  applyTheme: (theme) => set({ theme }),

  // creator pool things
  selectedPoolId: null,
  setSelectedPoolId: (id) => set({ selectedPoolId: id }),

  // saveChanges bundles changes and makes edit requests to server
  // function could be re-ordered as a promise chain
  saveChanges: async () => {
    console.log('Saving changes...');
    const { profile, theme, blocks } = useEditorStore.getState();
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === defaultAuthUser || authUser.email !== profile.email) {
        console.error('Save Error: No user logged in');
        toast.error('Authentication error');
        return;
      }
      const theme_status = await editTheme(
        {
          id: theme.id,
          name: theme.name,
          share_level: theme.share_level,
          share_config: theme.share_config,
          config: theme.config,
        },
        authUser.id
      );
      const blocks_status = await editBlocks(blocks, authUser.id);

      if (theme.id !== theme_status.result.id) {
        // new theme was created
        set((state) => ({
          theme: { ...state.theme, id: theme_status.result.id },
        }));
      }

      const status = await editUser({
        id: authUser.id,
        name: profile.name,
        email: profile.email,
        onelink: profile.onelink,
        description: profile.bio,
        image: profile.photoUrl || '',
        reward_business_id: '',
        theme: theme_status.result.id,
      });

      if (!status) {
        console.error('User Save failed');
        console.error(status);
        return;
      }
      if (!theme_status) {
        console.error('Theme Save failed');
        console.error(theme_status);
        return;
      }
      if (!blocks_status) {
        console.error('Blocks Save failed');
        console.error(blocks_status);
        return;
      }
      console.log('Save success');
      toast.success('Changes saved successfully');
      set({ changes: false });
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Error saving changes');
    }
  },
  setDefault: () => set({ ...initialState, changes: false }),
}));
