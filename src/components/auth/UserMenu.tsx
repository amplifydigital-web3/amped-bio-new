"use client";

import { useState } from "react";
import { LogOut, User } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useEditorStore } from "../../store/editorStore";
import { AuthModal } from "./AuthModal";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAmplifyConnect } from "../connect/hooks/useAmplifyConnect";
import { useNavigate } from "react-router-dom";
import { defaultAuthUser } from "@/store/defaults";

export function UserMenu() {
  const amplifyConnect = useAmplifyConnect();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { authUser, signOut } = useAuthStore();
  const { profile, setUser, setDefault } = useEditorStore();
  const nav = useNavigate();

  const handleSignIn = user => {
    setShowAuthModal(false);
    setUser(user.onelink);
    const onelink = user.onelink;
    if (onelink) {
      return nav(`/${onelink}`);
    }
    return nav("/");
  };

  const handleCancelAuth = () => {
    setShowAuthModal(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setDefault();
      nav("/");
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  const handleNavtoHome = () => {
    return nav(`/@${authUser?.onelink}`);
  };

  if (authUser.email === defaultAuthUser.email) {
    return (
      <>
        <Button onClick={() => setShowAuthModal(true)} className="flex items-center space-x-2">
          <User className="w-4 h-4" />
          <span>Sign In</span>
        </Button>
        {showAuthModal && (
          <AuthModal onClose={user => handleSignIn(user)} onCancel={() => handleCancelAuth()} />
        )}
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
          {" "}
          <User className="w-4 h-4" />
          <span>{authUser.email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          <span>Sign Out</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={amplifyConnect.handleClick}>
          <span>
            {amplifyConnect.account.address
              ? `${amplifyConnect.account.address.substring(
                  0,
                  4
                )}...${amplifyConnect.account.address.substring(
                  amplifyConnect.account.address.length - 4
                )}`
              : "Connect Web3 Wallet"}
          </span>
        </DropdownMenuItem>
        {authUser.onelink !== profile.onelink && (
          <DropdownMenuItem onClick={handleNavtoHome}>
            <span>Go To My Home</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
