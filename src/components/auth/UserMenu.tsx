'use client'

import { useState } from 'react'
import { LogOut, User, Wallet } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useEditorStore } from '../../store/editorStore'
import { AuthModal } from './AuthModal'
import toast from 'react-hot-toast'
import Web3ConnectButton from '../connect/components/components/Connect'
import { Button } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function UserMenu() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { user, signOut } = useAuthStore()
  const { setUser, setDefault } = useEditorStore()

  const handleSignIn = (user) => {
    setShowAuthModal(false)
    setUser(user)
  }

  const handleCancelAuth = () => {
    setShowAuthModal(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setDefault()
      toast.success('Signed out successfully')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  if (!user) {
    return (
      <>
        <Button onClick={() => setShowAuthModal(true)} className="flex items-center space-x-2">
          <User className="w-4 h-4" />
          <span>Sign In</span>
        </Button>
        {showAuthModal && <AuthModal onClose={(user) => handleSignIn(user)} onCancel={() => handleCancelAuth()} />}
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
      <button className='flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors'>Open</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          <span>Sign Out</span>
        </DropdownMenuItem>
        <Web3ConnectButton/>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

