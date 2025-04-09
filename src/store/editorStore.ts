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
import type { AuthUser } from '../types/auth';
import {
  editUser,
  getUser,
  editTheme,
  editBlocks,
  deleteBlock,
  getOnelink,
  addBlock as apiAddBlock,
} from '../api/api';
import initialState, { defaultAuthUser } from './defaults';
import { isNumber } from '@tsparticles/engine';
import { useAuthStore } from './authStore';
import toast from 'react-hot-toast';

interface EditorStore extends EditorState {
  changes: boolean;
  setUser: (onelink: string) => Promise<any>;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: Block) => Promise<Block>; // Updated return type
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

export const useEditorStore = create<EditorStore>()(set => ({
  changes: false,
  ...initialState,
  setUser: async (onelink: string) => {
    console.group(`🔍 Setting User: ${onelink}`);
    console.info('🚀 Loading user data...');
    try {
      const userData = await getOnelink(onelink);
      if (!userData) {
        console.info('❌ User not found:', onelink);
        console.groupEnd();
        return;
      }
      const { user, theme, blocks: blocks_raw } = userData;
      const { name, email, description, image } = user;
      console.info('👤 User data loaded:', { name, email });

      set({
        profile: { name, onelink, email, bio: description, photoUrl: image },
      });
      console.info('🎨 Setting theme...');
      set({ theme: { ...initialState.theme, ...theme } });
      const blocks = blocks_raw
        .sort((a, b) => a.order - b.order)
        .map(({ id, type, config }) => {
          return { ...config, id, type };
        });
      console.info(`📦 Setting ${blocks.length} blocks...`);
      set({ blocks: blocks });
      console.info('✅ User setup complete');
      console.groupEnd();
      return userData;
    } catch (error) {
      console.info('❌ Error getting user:', error);
      console.groupEnd();
      return;
    }
  },
  setProfile: profile => {
    console.group('👤 Setting Profile');
    console.info('New profile data:', profile);
    set({ profile, changes: true });
    console.info('✅ Profile updated');
    console.groupEnd();
  },
  addBlock: async (block: Block): Promise<Block> => {
    console.group('➕ Adding Block');
    console.info('Block data:', block);

    const { authUser } = useAuthStore.getState();
    let newBlock = block; // Initialize with the original block

    try {
      if (authUser === defaultAuthUser) {
        console.info('❌ Add Block Error: No user logged in');
        toast.error('Authentication error');
        console.groupEnd();

        // Still add to local state even if not authenticated
        set(state => ({
          blocks: [...state.blocks, block],
          changes: true,
        }));
        return block; // Return original block
      }

      // Prepare block data for API
      const { type, ...config } = block;
      const blockOrder = useEditorStore.getState().blocks.length;

      console.info('🔄 Adding block to server...');
      const response = await apiAddBlock({ type, order: blockOrder, ...config });
      console.info('✅ Block added to server:', response);

      // Update block with server-generated ID if available
      if (response?.result) {
        newBlock = {
          ...block,
          id: response.result.id,
        };
      }

      set(state => ({
        blocks: [...state.blocks, newBlock],
        changes: false, // No changes needed since we just saved to the server
      }));

      toast.success('Block added successfully');
      console.info('✅ Block added to state');
    } catch (error) {
      console.info('❌ Error adding block:', error);
      toast.error('Error adding block');

      // Still add to local state on error
      set(state => ({
        blocks: [...state.blocks, block],
        changes: true,
      }));
    }

    console.groupEnd();
    return newBlock; // Return the block with server-generated ID if available
  },
  removeBlock: async (id: number) => {
    console.group(`🗑️ Removing Block: ${id}`);
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === defaultAuthUser) {
        console.info('❌ Remove Block Error: No user logged in');
        toast.error('Authentication error');
        console.groupEnd();
        return;
      }

      console.info('🔄 Deleting block from server...');
      await deleteBlock(id);
      console.info('✅ Block deleted from server');

      set(state => ({
        blocks: state.blocks.filter(block => block.id !== id),
      }));
      console.info('✅ Block removed from state');
      console.groupEnd();
    } catch (error) {
      console.info('❌ Error deleting block:', error);
      console.groupEnd();
    }
  },
  updateBlock: (id: number, updatedBlock: Partial<Block>) => {
    console.group(`🔄 Updating Block: ${id}`);
    console.info('Update data:', updatedBlock);
    set(
      state =>
        ({
          blocks: state.blocks.map(block =>
            block.id === id ? { ...block, ...updatedBlock } : block
          ),
          changes: true,
        }) as Partial<EditorStore>
    );
    console.info('✅ Block updated');
    console.groupEnd();
  },
  reorderBlocks: (blocks: Block[]) => {
    console.group('🔀 Reordering Blocks');
    console.info(`Reordering ${blocks.length} blocks`);
    set({ blocks, changes: true });
    console.info('✅ Blocks reordered');
    console.groupEnd();
  },
  updateThemeConfig: config => {
    console.group('🎨 Updating Theme Config');
    console.info('New config:', config);
    set(state => ({
      theme: { ...state.theme, config: { ...state.theme.config, ...config } },
      changes: true,
    }));
    console.info('✅ Theme config updated');
    console.groupEnd();
  },
  setActivePanel: (activePanel: string) => {
    console.group('📋 Setting Active Panel');
    console.info(`Panel: ${activePanel}`);
    set({ activePanel });
    console.info('✅ Active panel set');
    console.groupEnd();
  },
  setBackground: (background: Background) => {
    console.group('🖼️ Setting Background');
    console.info('Background:', background);
    set(state => ({
      theme: {
        ...state.theme,
        config: { ...state.theme.config, background },
      },
      changes: true,
    }));
    console.info('✅ Background updated');
    console.groupEnd();
  },
  addToGallery: image => {
    console.group('🖼️ Adding to Gallery');
    console.info('Image:', image);
    set(state => ({
      gallery: [...state.gallery, image],
    }));
    console.info('✅ Image added to gallery');
    console.groupEnd();
  },
  removeFromGallery: url => {
    console.group('🗑️ Removing from Gallery');
    console.info('URL:', url);
    set(state => ({
      gallery: state.gallery.filter(image => image.url !== url),
    }));
    console.info('✅ Image removed from gallery');
    console.groupEnd();
  },
  setMarketplaceView: marketplaceView => {
    console.group('🛒 Setting Marketplace View');
    console.info(`View: ${marketplaceView}`);
    set({ marketplaceView });
    console.info('✅ Marketplace view updated');
    console.groupEnd();
  },
  setMarketplaceFilter: marketplaceFilter => {
    console.group('🔍 Setting Marketplace Filter');
    console.info(`Filter: ${marketplaceFilter}`);
    set({ marketplaceFilter });
    console.info('✅ Marketplace filter updated');
    console.groupEnd();
  },
  setMarketplaceSort: marketplaceSort => {
    console.group('📊 Setting Marketplace Sort');
    console.info(`Sort: ${marketplaceSort}`);
    set({ marketplaceSort });
    console.info('✅ Marketplace sort updated');
    console.groupEnd();
  },
  applyTheme: theme => {
    console.group('🎨 Applying Theme');
    console.info('Theme:', theme.name);
    set({ theme });
    console.info('✅ Theme applied');
    console.groupEnd();
  },
  selectedPoolId: null,
  setSelectedPoolId: id => {
    console.group('🏊 Setting Selected Pool ID');
    console.info(`Pool ID: ${id}`);
    set({ selectedPoolId: id });
    console.info('✅ Selected pool ID updated');
    console.groupEnd();
  },
  saveChanges: async () => {
    console.group('💾 Saving Changes');
    console.info('Starting save process...');
    const { profile, theme, blocks } = useEditorStore.getState();
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === defaultAuthUser || authUser.email !== profile.email) {
        console.info('❌ Save Error: No user logged in or email mismatch');
        toast.error('Authentication error');
        console.groupEnd();
        return;
      }

      console.info('🎨 Saving theme...');
      const theme_status = await editTheme({
        id: theme.id,
        name: theme.name,
        share_level: theme.share_level,
        share_config: theme.share_config,
        config: theme.config,
      });

      console.info('Theme status:', theme_status);

      console.info('Theme', theme);

      console.info('📦 Saving blocks...');
      const blocks_status = await editBlocks(blocks);

      if (theme.id !== theme_status.id) {
        console.info('🆕 New theme created, updating ID');
        set(state => ({
          theme: { ...state.theme, id: theme_status.id },
        }));
      }

      console.info('👤 Saving user profile...');
      const status = await editUser({
        name: profile.name,
        email: profile.email,
        onelink: profile.onelink.replace(/@/g, ''),
        description: profile.bio,
        image: profile.photoUrl || '',
        reward_business_id: '',
        theme: theme_status.id,
      });

      if (!status) {
        console.info('❌ User Save failed');
        console.info(status);
        console.groupEnd();
        return;
      }
      if (!theme_status) {
        console.info('❌ Theme Save failed');
        console.info(theme_status);
        console.groupEnd();
        return;
      }
      if (!blocks_status) {
        console.info('❌ Blocks Save failed');
        console.info(blocks_status);
        console.groupEnd();
        return;
      }
      console.info('✅ Save success');
      toast.success('Changes saved successfully');
      set({ changes: false });
      console.groupEnd();
    } catch (error) {
      console.info('❌ Save failed:', error);
      toast.error('Error saving changes');
      console.groupEnd();
    }
  },
  setDefault: () => {
    console.group('🔄 Resetting to Default');
    set({ ...initialState, changes: false });
    console.info('✅ Reset to default state');
    console.groupEnd();
  },
}));
