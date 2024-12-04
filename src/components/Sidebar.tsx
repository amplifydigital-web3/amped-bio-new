import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { 
  User, Link, Palette, Sparkles, LayoutGrid, Download,
} from 'lucide-react';
import { exportSettings } from '../utils/export';

const navItems = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'links', icon: Link, label: 'Links' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'effects', icon: Sparkles, label: 'Effects' },
  { id: 'blocks', icon: LayoutGrid, label: 'Blocks' },
];

export function Sidebar() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const editorState = useEditorStore();

  const handleExport = () => {
    exportSettings({
      profile: editorState.profile,
      blocks: editorState.blocks,
      theme: editorState.theme,
      activePanel: editorState.activePanel,
    });
  };

  return (
    <div className="w-full h-16 md:w-20 md:h-screen bg-white border-b md:border-r border-gray-200">
      <div className="h-full flex md:flex-col items-center justify-around md:justify-start md:py-6">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-colors ${
              activePanel === id
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs mt-1">{label}</span>
          </button>
        ))}
        
        <div className="md:mt-auto md:mb-6">
          <button
            onClick={handleExport}
            className="w-12 h-12 flex flex-col items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Export Settings"
          >
            <Download className="w-5 h-5" />
            <span className="text-xs mt-1">Export</span>
          </button>
        </div>
      </div>
    </div>
  );
}