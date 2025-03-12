import React, { useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import {
  User, Link, Palette, Sparkles, Sparkle, LayoutGrid, Image, CoinsIcon, Trophy, AtSign, Download, Upload
} from 'lucide-react';
import { exportSettings } from '../utils/export';
import { importSettings } from '../utils/import';

const navItems = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'effects', icon: Sparkles, label: 'Effects' },
  { id: 'blocks', icon: LayoutGrid, label: 'Blocks' },
];

if (import.meta.env.VITE_SHOW_GALLERY === 'true') {
  navItems.splice(1, 0, { id: 'gallery', icon: Image, label: 'Gallery' });
}

if (import.meta.env.VITE_SHOW_REWARD === 'true') {
  navItems.splice(5, 0, { id: 'reward', icon: Sparkle, label: 'Reward' });
}

if (import.meta.env.VITE_SHOW_CREATOR_POOL === 'true') {
  navItems.splice(6, 0, { id: 'creatorpool', icon: CoinsIcon, label: 'CreatorPool' }, { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' });
}

if (import.meta.env.VITE_SHOW_RNS === 'true') {
  navItems.splice(8, 0, { id: 'rns', icon: AtSign, label: 'RNS' });
}

export function Sidebar() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const editorState = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    exportSettings({
      profile: editorState.profile,
      blocks: editorState.blocks,
      theme: editorState.theme,
      activePanel: editorState.activePanel,
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importSettings(file);
      // Reset the input value to allow importing the same file again
      e.target.value = '';
    } catch (error) {
      console.error('Failed to import settings:', error);
      alert('Failed to import settings. Please check the file format.');
    }
  };

  return (
    <div className="w-full h-16 md:w-20 md:h-screen bg-white border-b md:border-r border-gray-200">
      <div className="h-full flex md:flex-col items-center justify-around md:justify-start md:py-6">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-colors ${activePanel === id
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs mt-1">{label}</span>
          </button>
        ))}

        <div className="md:mt-auto md:mb-6 flex md:flex-col items-center space-x-2 md:space-x-0 md:space-y-2">
          <button
            onClick={handleExport}
            className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Export Settings"
          >
            <Download className="w-5 h-5" />
            <span className="text-xs mt-1">Export</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Import Settings"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs mt-1">Import</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}