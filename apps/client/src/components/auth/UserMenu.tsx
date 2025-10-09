import { useState, useEffect } from "react";
import { LogOut, User, ArrowRight, Wallet } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useEditor } from "../../contexts/EditorContext";
import { AuthModal } from "./AuthModal";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { formatOnelink } from "@/utils/onelink";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { useWalletContext } from "@/contexts/WalletContext";
import { AuthUser } from "@/types/auth";
import { trackGAEvent } from "@/utils/ga";

export function UserMenu() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { authUser, signOut } = useAuth();
  const walletContext = useWalletContext();
  const { profile, setUser, setDefault } = useEditor();
  const nav = useNavigate();
  const { address: walletAddress } = useAccount();

  // Reset image error state when user changes
  useEffect(() => {
    if (authUser?.image) {
      setImageError(false);
    }
  }, [authUser]);

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleSignIn = (user: AuthUser) => {
    setShowAuthModal(false);
    setUser(user.onelink);

    // Redirect to the edit page instead of public profile
    if (user && user.onelink) {
      const formattedOnelink = formatOnelink(user.onelink);
      // Check if there's a panel parameter in the current URL
      const searchParams = new URLSearchParams(window.location.search);
      const panelParam = searchParams.get("p");
      
      if (panelParam) {
        return nav(`/${formattedOnelink}/edit?p=${panelParam}`);
      }
      return nav(`/${formattedOnelink}/edit`);
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

  

  const handleNavigateToWallet = () => {
    if (authUser?.onelink) {
      return nav(`/${formatOnelink(authUser.onelink)}/edit?p=wallet`);
    }
  };

  const handleNavigateToProfile = () => {
    if (authUser?.onelink) {
      return nav(`/${formatOnelink(authUser.onelink)}/edit?p=profile`);
    }
  };

  if (authUser === null) {
    return (
      <>
        <Button
          onClick={() => {
            trackGAEvent("Click", "AuthModal", "OpenModalButton");
            setShowAuthModal(true);
            window.history.replaceState(null, "", "/login");
          }}
          className="flex items-center space-x-2"
        >
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
        <button
          className={cn(
            "group relative w-auto cursor-pointer overflow-hidden rounded-full border bg-white hover:bg-gray-50 p-2 px-4 text-center font-medium transition-all shadow-sm"
          )}
        >
          {/* Default state - visible content */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center transition-all duration-300 group-hover:scale-105">
              {authUser?.image && !imageError ? (
                <img
                  src={authUser.image}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <User className="w-4 h-4 text-gray-400" />
              )}
            </div>
            <div className="flex flex-col items-start transition-all duration-300 group-hover:translate-x-2 group-hover:opacity-0">
              {walletAddress || walletContext.connecting ? (
                <>
                  <span className="text-sm font-semibold text-gray-900">
                    {walletContext.connecting ? (
                      <div className="h-4 w-20 bg-gray-200 animate-pulse rounded"></div>
                    ) : (
                      formatAddress(walletAddress!)
                    )}
                  </span>
                  <span className="text-xs text-gray-500">@{authUser.onelink}</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-gray-900">@{authUser.onelink}</span>
              )}
            </div>
          </div>

          {/* Hover state - hidden content that slides in */}
          <div className="absolute top-0 left-0 z-10 flex h-full w-full translate-x-full items-center justify-center gap-2 bg-blue-600 text-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 rounded-full">
            <span className="text-sm font-medium">View Profile</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleNavigateToProfile}>
          <User className="w-4 h-4 mr-2" />
          <span>Edit Profile</span>
        </DropdownMenuItem>
        {import.meta.env.VITE_SHOW_WALLET === "true" && (
          <DropdownMenuItem onClick={handleNavigateToWallet}>
            <Wallet className="w-4 h-4 mr-2" />
            <span>My Wallet</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          <span>Sign Out</span>
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
