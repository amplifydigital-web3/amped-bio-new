import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { Preview } from "../components/Preview";
import { Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { AuthModal } from "../components/auth/AuthModal";
import { formatOnelink, normalizeOnelink } from "@/utils/onelink";
import type { AuthUser } from "../types/auth";
import { UserMenu } from "../components/auth/UserMenu";
import AMPLIFY_FULL_K from "@/assets/AMPLIFY_FULL_K.svg";
import { trpcClient } from "@/utils/trpc";
import type { UserProfile, Theme } from "@/types/editor";
import { TRPCClientError } from "@trpc/client";
import initialState from "@/store/defaults";
import { BlockType } from "@ampedbio/constants";

// Default onelink username to show when accessing root URL
const DEFAULT_ONELINK = "landingpage";

export function View() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Use default onelink when on root URL with no onelink parameter
  const effectiveOnelink =
    ["/", "/register"].includes(location.pathname) && (!onelink || onelink === "")
      ? DEFAULT_ONELINK
      : onelink;

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(effectiveOnelink);

  // Determine if this is the initial/home page (no onelink parameter in URL)
  const isInitialPage = !onelink || onelink === "";

  // Check if we're on the register route
  const isRegisterRoute = location.pathname === "/register";

  // Determine if navbar should be shown (landingpage user, root route, or register route)
  const shouldShowNavbar =
    normalizedOnelink === DEFAULT_ONELINK || location.pathname === "/" || isRegisterRoute;

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
    if (normalizedOnelink) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const onlinkData = await trpcClient.onelink.getOnelink.query({
            onelink: normalizedOnelink,
          });

          if (onlinkData) {
            const { user, theme, blocks: blocks_raw } = onlinkData;
            const { name, email, description, image } = user;
            const formattedOnelink = formatOnelink(normalizedOnelink);

            setProfile({
              name,
              onelink: normalizedOnelink,
              onelinkFormatted: formattedOnelink,
              email,
              bio: description ?? "",
              photoUrl: image ?? "",
              photoCmp: "",
            });

            setTheme(theme as unknown as Theme);
            const sortedBlocks = blocks_raw.sort((a, b) => a.order - b.order);
            setBlocks(sortedBlocks as unknown as BlockType[]);
          } else {
            // Only redirect if the current onelink is not already the default
            if (normalizedOnelink !== DEFAULT_ONELINK) {
              navigate("/");
            }
          }
        } catch (error) {
          console.error("Failed to fetch onelink data:", error);
          
          // Check if this is a TRPCClientError with NOT_FOUND code for the DEFAULT_ONELINK
          if (
            error instanceof TRPCClientError && 
            error.data?.code === "NOT_FOUND" && 
            normalizedOnelink === DEFAULT_ONELINK
          ) {
            // Use default data from initialState
            setProfile(initialState.profile);
            setTheme(initialState.theme);
            setBlocks(initialState.blocks);
          } 
          // Only redirect on error if not the default onelink
          else if (normalizedOnelink !== DEFAULT_ONELINK) {
            navigate("/");
          }
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [normalizedOnelink, navigate]);

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

  if (loading || !profile || !theme) {
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

      <Preview
        isEditing={false}
        onelink={normalizedOnelink}
        profile={profile}
        blocks={blocks}
        theme={theme}
      />

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
