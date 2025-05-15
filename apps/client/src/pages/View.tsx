import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { Preview } from "../components/Preview";
import { Settings } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { AuthModal } from "../components/auth/AuthModal";
import { formatOnelink, normalizeOnelink } from "@/utils/onelink";
import type { AuthUser } from "../types/auth";
import { UserMenu } from "../components/auth/UserMenu";
import AMPLIFY_FULL_K from "@/assets/AMPLIFY_FULL_K.svg";

// Default onelink username to show when accessing root URL
const DEFAULT_ONELINK = "landingpage";

export function View() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const profile = useEditorStore(state => state.profile);
  const setUser = useEditorStore(state => state.setUser);
  const location = useLocation();
  const navigate = useNavigate();

  // Use default onelink when on root URL with no onelink parameter
  const effectiveOnelink =
    location.pathname === "/" && (!onelink || onelink === "") ? DEFAULT_ONELINK : onelink;

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(effectiveOnelink);

  // Determine if this is the initial/home page (no onelink parameter in URL)
  const isInitialPage = !onelink || onelink === "";

  // Check if we're on the register route
  const isRegisterRoute = location.pathname === "/register";

  // Determine if navbar should be shown (landingpage user, root route, or register route)
  const shouldShowNavbar =
    normalizedOnelink === "landingpage" || location.pathname === "/" || isRegisterRoute;

  // Show auth modal when on register route and not logged in
  const [showAuthModal, setShowAuthModal] = useState(isRegisterRoute && !authUser);
  const [initialAuthForm, setInitialAuthForm] = useState<"login" | "register" | "reset">(
    isRegisterRoute ? "register" : "login"
  );

  // Effect to handle /register route when auth state changes
  useEffect(() => {
    if (isRegisterRoute && !authUser) {
      setShowAuthModal(true);
      setInitialAuthForm("register");
    } else if (isRegisterRoute && authUser) {
      // If already logged in, redirect to their edit page
      const formattedOnelink = formatOnelink(authUser.onelink);
      navigate(`/${formattedOnelink}/edit`);
    }
  }, [isRegisterRoute, authUser, navigate]);

  // Redirect to URL with @ symbol if missing
  useEffect(() => {
    // Only redirect if:
    // 1. We have a onelink
    // 2. Not on register path
    // 3. Not the landingpage on root URL
    // 4. The onelink doesn't already start with @
    if (
      effectiveOnelink &&
      !isRegisterRoute &&
      !(effectiveOnelink === "landingpage" && location.pathname === "/") &&
      !effectiveOnelink.startsWith("@")
    ) {
      // Navigate to the same route but with @ symbol
      navigate(`/@${effectiveOnelink}${location.search}`, { replace: true });
    }
  }, [effectiveOnelink, navigate, location.pathname, location.search, isRegisterRoute]);

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
    if (isRegisterRoute) {
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
    if (isRegisterRoute) {
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <img src={AMPLIFY_FULL_K} alt="Amplify Logo" className="h-12 mb-6" />
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-t-black border-r-gray-200 border-b-gray-200 border-l-gray-200 animate-spin"></div>
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar - Visible when on landingpage profile or root route */}
      {shouldShowNavbar && (
        <header className="sticky top-0 z-30 h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center">
            <img src={AMPLIFY_FULL_K} alt="Amplify Logo" className="h-8" />
          </div>
          <UserMenu />
        </header>
      )}

      <Preview isEditing={false} onelink={normalizedOnelink} />

      {/* Edit Button */}
      {authUser && (isInitialPage || authUser.email === profile.email) && (
        <Link
          to={`/${formatOnelink(authUser.onelink)}/edit`}
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
