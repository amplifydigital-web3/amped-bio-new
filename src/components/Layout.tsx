import { Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { UserMenu } from './auth/UserMenu';
import SaveButton from './panels/SaveButton.tsx';
import { useEditorStore } from '../store/editorStore';
import { ProfilePanel } from './panels/profile/ProfilePanel';
import { GalleryPanel } from './panels/gallery/GalleryPanel';
import { AppearancePanel } from './panels/appearance/AppearancePanel';
import { EffectsPanel } from './panels/effects/EffectsPanel';
import { BlocksPanel } from './panels/blocks/BlocksPanel';
import { CreatorPoolPanel } from './panels/creatorpool/CreatorPoolPanel';
import { LeaderboardPanel } from './panels/leaderboard/LeaderboardPanel';
import { RNSPanel } from './panels/rns/RNSPanel';
import { Eye } from 'lucide-react';
import RewardPanel from './panels/reward/RewardPanel.tsx';
import EmailVerificationBanner from './auth/EmailVerificationBanner.tsx';
import { useAuthStore } from '@/store/authStore.ts';

interface LayoutProps {
  onelink: string;
}

export function Layout(props: LayoutProps) {
  const { onelink } = props;
  const activePanel = useEditorStore((state) => state.activePanel);
  const emailVerified = useAuthStore((state) => state.authUser.emailVerified);

  // FOR TESTING
  const usr = useAuthStore((state) => state.authUser);

  // Determine if we should use wider panel layout
  const isWidePanel = activePanel === 'gallery' || activePanel === 'creatorpool' || activePanel === 'leaderboard' || activePanel === 'rns' || activePanel === 'reward';
  const panelWidth = isWidePanel ? 'md:w-[800px]' : 'md:w-[400px]';

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row w-full">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="h-16 border-b bg-white px-6 flex items-center justify-between shrink-0">
            {/* View Button */}
            <div className='max-h-10'>
              <Link
                to={`/${onelink}`}
                className=" px-4 py-2 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
              >
                <Eye className="w-4 h-4" />
                <span className="text-sm font-medium">View Page</span>
              </Link>
            </div>

            {!emailVerified || usr.email === 'will@amplifydigital.ai' && (<EmailVerificationBanner />)}
            <div className='flex items-center justify-end'>
              <SaveButton />
              <UserMenu />
            </div>

          </div>
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            <div className={`w-full ${activePanel !== 'reward' ? 'border-b md:border-b-0 md:border-r' : ''} ${panelWidth} border-gray-200 bg-white overflow-y-auto`}>
              {activePanel === 'profile' && <ProfilePanel />}
              {activePanel === 'reward' && <RewardPanel />}
              {activePanel === 'gallery' && <GalleryPanel />}
              {activePanel === 'appearance' && <AppearancePanel />}
              {activePanel === 'effects' && <EffectsPanel />}
              {activePanel === 'blocks' && <BlocksPanel />}
              {activePanel === 'creatorpool' && <CreatorPoolPanel />}
              {activePanel === 'leaderboard' && <LeaderboardPanel />}
              {activePanel === 'rns' && <RNSPanel />}
            </div>
            {
              activePanel !== 'reward' && <div className="flex flex-col flex-1 overflow-y-auto relative">
                <Preview isEditing={true} onelink={onelink} />


              </div>
            }
          </div>
        </main>
      </div>
    </div>
  );
}
