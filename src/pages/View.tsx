import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { Preview } from "../components/Preview";
import { Settings } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { defaultAuthUser } from "@/store/defaults";
import { AuthModal } from "../components/auth/AuthModal";
import { formatOnelink, normalizeOnelink } from "@/utils/onelink";
import type { AuthUser } from "../types/auth";
import { UserMenu } from "../components/auth/UserMenu";

export function View() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const profile = useEditorStore(state => state.profile);
  const setUser = useEditorStore(state => state.setUser);
  const location = useLocation();
  const navigate = useNavigate();

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(onelink);

  // Determine if this is the initial/home page (no onelink parameter)
  const isInitialPage = !onelink || onelink === "";

  // Check if we're on the register route to show the auth modal
  const [showAuthModal, setShowAuthModal] = useState(location.pathname === "/register");
  const [initialAuthForm, setInitialAuthForm] = useState<"login" | "register" | "reset">(
    location.pathname === "/register" ? "register" : "login"
  );

  // Redirect to URL with @ symbol if missing
  useEffect(() => {
    // Only redirect if we have a onelink and not on register path
    if (onelink && location.pathname !== "/register" && !onelink.startsWith("@")) {
      // Navigate to the same route but with @ symbol
      navigate(`/@${onelink}${location.search}`, { replace: true });
    }
  }, [onelink, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (normalizedOnelink && normalizedOnelink !== profile.onelink) {
      setLoading(true);
      setUser(normalizedOnelink).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    console.info("onelink", normalizedOnelink);
  }, [normalizedOnelink, profile, setUser]);

  // Handle auth modal close
  const handleSignIn = (user: AuthUser) => {
    setShowAuthModal(false);
    // Clean up the URL if we were on /register
    if (location.pathname === "/register") {
      navigate("/");
    }

    // If user registered/logged in, redirect to their edit page
    if (user && user.onelink) {
      const formattedOnelink = formatOnelink(user.onelink);
      navigate(`/${formattedOnelink}/edit`);
    }
  };

  // Handle auth modal cancel
  const handleCancelAuth = () => {
    setShowAuthModal(false);
    // Clean up the URL if we were on /register
    if (location.pathname === "/register") {
      navigate("/");
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar - Only visible on the initial page */}
      {isInitialPage && (
        <header className="sticky top-0 z-30 h-16 border-b bg-white px-6 flex items-center justify-end shrink-0 shadow-sm">
          <UserMenu />
        </header>
      )}

      <Preview isEditing={false} onelink={normalizedOnelink} />

      {/* Edit Button */}
      {authUser.id != 0 && authUser !== defaultAuthUser && authUser.email === profile.email && (
        <Link
          to={`/${normalizedOnelink.length > 0 ? normalizedOnelink : profile.onelink}/edit`}
          className="fixed bottom-4 right-4 p-3 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2 z-50"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Edit Page</span>
        </Link>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={handleSignIn}
          onCancel={handleCancelAuth}
          initialForm={initialAuthForm}
        />
      )}
    </div>
  );
}
