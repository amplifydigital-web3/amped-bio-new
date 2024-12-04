import React from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { useEditorStore } from '../store/editorStore';
import { ProfilePanel } from './panels/profile/ProfilePanel';
import { LinksPanel } from './panels/links/LinksPanel';
import { AppearancePanel } from './panels/appearance/AppearancePanel';
import { EffectsPanel } from './panels/effects/EffectsPanel';
import { BlocksPanel } from './panels/blocks/BlocksPanel';
import { Eye } from 'lucide-react';

export function Layout() {
  const activePanel = useEditorStore((state) => state.activePanel);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col md:flex-row">
          <div className="w-full md:w-[400px] border-b md:border-b-0 md:border-r border-gray-200 bg-white overflow-y-auto">
            {activePanel === 'profile' && <ProfilePanel />}
            {activePanel === 'links' && <LinksPanel />}
            {activePanel === 'appearance' && <AppearancePanel />}
            {activePanel === 'effects' && <EffectsPanel />}
            {activePanel === 'blocks' && <BlocksPanel />}
          </div>
          <div className="flex-1 overflow-y-auto relative">
            <Preview />
            
            {/* View Button */}
            <Link
              to="/view"
              className="absolute top-4 right-4 px-4 py-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <Eye className="w-4 h-4" />
              <span className="text-sm font-medium">View Page</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}