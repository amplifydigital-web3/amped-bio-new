import React, { useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { AuthModal } from './AuthModal';
import toast from 'react-hot-toast';
import Web3ConnectButton from '../connect/components/components/Connect';

export function UserMenu() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, signOut } = useAuthStore();
  const { setUser } = useEditorStore();

  const handleSignIn = (user) => {
    setShowAuthModal(false);
    setUser(user);
  };

  const handleCancelAuth = () => {
    setShowAuthModal(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (error) {
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
    <div className="relative flex items-center space-x-2">
      <Web3ConnectButton/>

      <div className="relative group">
        <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
          <User className="w-4 h-4" />
          <span>{user.email}</span>
        </button>

        <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg opacity-0 scale-95 transform group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 ease-out z-10">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-4 py-2 text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
