import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { UserMenu } from './auth/UserMenu';
import SaveButton from './panels/SaveButton.tsx';
import { useEditorStore } from '../store/editorStore';
import { ProfilePanel } from './panels/profile/ProfilePanel';
import { AppearancePanel } from './panels/appearance/AppearancePanel';
import { EffectsPanel } from './panels/effects/EffectsPanel';
import { BlocksPanel } from './panels/blocks/BlocksPanel';
import { Eye } from 'lucide-react';
import RewardPanel from './panels/reward/RewardPanel.tsx';

export function Layout() {
  const activePanel = useEditorStore((state) => state.activePanel);

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row w-full">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b bg-white px-6 flex items-center justify-end shrink-0">
            <SaveButton />
            <UserMenu />
          </header>
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            <div className={`w-full ${activePanel !== 'reward' ? 'md:w-[400px] border-b md:border-b-0 md:border-r' : ''} border-gray-200 bg-white overflow-y-auto`}>
              {activePanel === 'profile' && <ProfilePanel />}
              {activePanel === 'appearance' && <AppearancePanel />}
              {activePanel === 'effects' && <EffectsPanel />}
              {activePanel === 'blocks' && <BlocksPanel />}
              {activePanel === 'reward' && <RewardPanel />}
            </div>
            {
              activePanel !== 'reward' && <div className="flex flex-col  overflow-y-auto relative">
                <Preview isEditing={true} />

                {/* View Button */}
                <Link
                  to="/"
                  className="absolute top-4 right-4 px-4 py-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
                >
                  <Eye className="w-4 h-4" />
                  <span className="text-sm font-medium">View Page</span>
                </Link>
              </div>
            }
          </div>
        </main>
      </div>
    </div>
  );
}
