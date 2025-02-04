import { useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { AuthModal } from './AuthModal';
import toast from 'react-hot-toast';

export function UserMenu() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, signOut } = useAuthStore();
  const { setUser, setDefault } = useEditorStore();

  const handleSignIn = (user) => {
    setShowAuthModal(false);
    setUser(user);
  }

  const handleCancelAuth = () => {
    setShowAuthModal(false);
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      setDefault();
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <User className="w-4 h-4" />
          <span>Sign In</span>
        </button>
        {showAuthModal && (
          <AuthModal onClose={(user) => handleSignIn(user)} onCancel={() => handleCancelAuth()} />
        )}
      </>
    );
  }

  return (
    <div className="relative group flex gap-4">
      <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
        <User className="w-4 h-4" />
        <span>{user.email}</span>
      </button>


      <button
        onClick={handleSignOut}
        className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2 rounded-lg"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>
    </div>

  );
}