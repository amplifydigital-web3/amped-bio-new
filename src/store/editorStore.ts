import { create } from 'zustand';
import type { EditorState, UserProfile, ThemeConfig, Background, Block } from '../types/editor';
import type { AuthUser } from '../types/auth';
import { editUser, getUser, editTheme, editBlocks, deleteBlock } from '../api';
import initialState from './defaults';

interface EditorStore extends EditorState {
  changes: boolean;
  setUser: (user: AuthUser) => void;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: Block) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, block: Partial<Block>) => void;
  reorderBlocks: (blocks: Block[]) => void;
  updateThemeConfig: (theme: Partial<ThemeConfig>) => void;
  setActivePanel: (panel: string) => void;
  setBackground: (background: Background) => void;
  saveChanges: () => void;
  setDefault: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  changes: false,
  ...initialState,
  setUser: async (authed_user) => {
    const { id, token } = authed_user;
    try {
      const userData = await getUser({ id, token });
      if (!userData) {
        console.error('User not found:', authed_user);
        return
      }
      const { user, theme, blocks: blocks_raw } = userData;
      const { name, email, onelink, description, image, reward_business_id } = user;
      set({ user: { ...user, email } });
      set({ profile: { name, title: onelink, bio: description, photoUrl: image } });
      set({ theme: { ...initialState.theme, ...theme } });
      const blocks = blocks_raw.sort((a, b) => a.order - b.order).map(({ id, type, config }) => { return { id, type, ...config } });
      set({ blocks: blocks });
      console.log('NEW BLOCKS', blocks);
    }
    catch (error) {
      console.error('Error getting user:', error);
      return
    }

  },
  setProfile: (profile) => set({ profile, changes: true }),
  addBlock: (block: Block) => set((state) => ({
    blocks: [...state.blocks, block],
    changes: true
  })),
  removeBlock: async (id: string) => {
    const { user } = useEditorStore.getState();
    try {
      await deleteBlock(id, user.id);
      set((state) => ({
        blocks: state.blocks.filter((block) => block.id !== id)
      }));
    } catch (error) {
      console.log('error deleting block', error);
    }
  },
  updateBlock: (id: string, updatedBlock: Partial<Block>) => set((state) => ({
    blocks: state.blocks.map((block) =>
      block.id === id ? { ...block, ...updatedBlock } : block
    ),
    changes: true
  }) as Partial<EditorStore>),
  reorderBlocks: (blocks: Block[]) => set({ blocks, changes: true }),
  updateThemeConfig: (config) => set((state) => ({
    theme: { ...state.theme, config: { ...state.theme.config, ...config } },
    changes: true
  })),
  setActivePanel: (activePanel: string) => set({ activePanel }),
  setBackground: (background: Background) => set((state) => ({
    theme: { ...state.theme, config: { ...state.theme.config, background } },
    changes: true
  })),
  saveChanges: async () => {
    // Save changes to the server
    console.log('Saving changes...');
    const { user, profile, theme, blocks } = useEditorStore.getState();
    try {
      const status = await editUser({ id: user.id, name: profile.name, email: user.email, onelink: profile.title, description: profile.bio, image: profile.photoUrl || '', reward_business_id: '' });
      const theme_status = await editTheme({ id: theme.id, name: theme.name, share_level: theme.share_level, share_config: theme.share_config, config: theme.config }, user.id);
      const blocks_status = await editBlocks(blocks, user.id);
      if (!status) {
        console.error('User Save failed');
        console.log(status);
        return;
      }
      if (!theme_status) {
        console.error('Theme Save failed');
        console.log(theme_status);
        return;
      }
      if (!blocks_status) {
        console.error('Blocks Save failed');
        console.log(blocks_status);
        return;
      }
      console.log('Save success');
      console.log(status);

      const userData = await getUser({ id: user.id, token: user.token });
      const { theme_new, blocks: blocks_raw } = userData;
      set({ theme: { ...initialState.theme, ...theme_new } });
      const blocks_new = blocks_raw.sort((a, b) => a.order - b.order).map(({ id, type, config }) => { return { id, type, ...config } });
      set({ blocks: blocks_new });

      set({ changes: false });
    } catch (error) {
      console.error('Save failed:', error)
    }

  },
  setDefault: () => set({ ...initialState, changes: false }),
}));