import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { Preview } from "../components/Preview";
import { Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { formatOnelink, normalizeOnelink } from "@/utils/onelink";
import { trpcClient } from "@/utils/trpc";
import type { UserProfile, Theme } from "@/types/editor";
import { TRPCClientError } from "@trpc/client";
import initialState from "@/store/defaults";
import { BlockType } from "@ampedbio/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthModal } from "@/components/auth/AuthModal";
import { AuthUser } from "@/types/auth";

// Default onelink username to show when accessing root URL
const DEFAULT_ONELINK = "landingpage";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col h-screen">
      {/* Background Layer - Fixed to viewport */}
      <div className="fixed inset-0 w-full h-full z-[1] bg-gray-100">
        <div className="absolute inset-0" />
      </div>

      {/* Content Layer */}
      <div className="min-h-full relative z-[2]">
        <div className="relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10 max-w-[640px]">
          {/* Container */}
          <div className="w-full space-y-8 p-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg">
            {/* Profile Section */}
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <Skeleton className="w-32 h-32 rounded-full object-cover ring-4 ring-white/50 shadow-xl" />
                <div className="absolute -inset-1 rounded-full" />
              </div>

              <div className="space-y-4">
                <Skeleton className="h-8 w-48 mx-auto rounded" />

                <div className="space-y-2">
                  <Skeleton className="h-4 w-64 mx-auto rounded" />
                  <Skeleton className="h-4 w-56 mx-auto rounded" />
                  <Skeleton className="h-4 w-60 mx-auto rounded" />
                </div>
              </div>
            </div>

            {/* Links & Blocks */}
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="w-full px-4 py-3 flex items-center space-x-3 rounded-lg"
                >
                  <Skeleton className="w-5 h-5 flex-shrink-0 rounded-full" />
                  <Skeleton className="flex-1 h-5 rounded" />
                </div>
              ))}
            </div>

            {/* Powered by footer */}
            <div className="pt-4 text-center">
              <Skeleton className="h-4 w-40 mx-auto rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function View() {
  const { onelink = "" } = useParams();
  const { authUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [hasCreatorPool, setHasCreatorPool] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if we're on the register route
  const isRegisterRoute = location.pathname === "/register";
  const isLoginRoute = location.pathname === "/login";

  const [loading, setLoading] = useState(isRegisterRoute || isLoginRoute ? false : true);

  // Use default onelink when on root URL with no onelink parameter
  const effectiveOnelink =
    ["/", "/register", "/login"].includes(location.pathname) && (!onelink || onelink === "")
      ? DEFAULT_ONELINK
      : onelink;

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(effectiveOnelink);

  // Determine if this is the initial/home page (no onelink parameter in URL)
  const isInitialPage = !onelink || onelink === "";

  // Show auth modal when on register route and not logged in
  const [showAuthModal, setShowAuthModal] = useState(isRegisterRoute && !authUser);
  const [initialAuthForm, setInitialAuthForm] = useState<"login" | "register" | "reset">(
    isRegisterRoute ? "register" : "login"
  );

  // Effect to handle /register or /login route when auth state changes
  useEffect(() => {
    if ((isRegisterRoute || isLoginRoute) && !authUser) {
      setShowAuthModal(true);
      setInitialAuthForm(isRegisterRoute ? "register" : "login");
    } else if ((isRegisterRoute || isLoginRoute) && authUser) {
      // If already logged in, redirect to their edit page
      const formattedOnelink = formatOnelink(authUser.onelink);
      navigate(`/${formattedOnelink}/edit`);
    }
  }, [isRegisterRoute, isLoginRoute, authUser, navigate]);

  // Redirect to URL with @ symbol if missing
  useEffect(() => {
    // Only redirect if:
    // 1. We have a onelink
    // 2. Not on register path
    // 3. Not the landingpage on root URL
    // 4. The onelink doesn't already start with @
    if (
      effectiveOnelink &&
      !(isRegisterRoute || isLoginRoute) &&
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
            const { user, theme, blocks: blocks_raw, hasCreatorPool } = onlinkData;
            const { name, email, description, image, revoName } = user;
            const formattedOnelink = formatOnelink(normalizedOnelink);

            setProfile({
              name,
              onelink: normalizedOnelink,
              onelinkFormatted: formattedOnelink,
              email,
              revoName: revoName ?? "",
              bio: description ?? "",
              photoUrl: image ?? "",
              photoCmp: "",
            });

            setTheme(theme as unknown as Theme);
            const sortedBlocks = blocks_raw.sort((a, b) => a.order - b.order);
            setBlocks(sortedBlocks as unknown as BlockType[]);
            setHasCreatorPool(hasCreatorPool);
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
    // Clean up the URL if we were on /register or /login
    if (isRegisterRoute || isLoginRoute) {
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
    // Clean up the URL if we were on /register or /login
    if (isRegisterRoute || isLoginRoute) {
      navigate("/");
    }
  };
  
  if (loading || !profile) {
    return (
      <div className="min-h-screen">
        <ProfileSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Preview
        isEditing={false}
        onelink={normalizedOnelink}
        profile={profile}
        blocks={blocks}
        theme={theme ?? initialState.theme}
      />

      <div className="fixed bottom-4 right-4 z-50 flex space-x-4">
        {/* View Creator Pool Button */}
        {hasCreatorPool && (
          <Link
            to={`/pools/${normalizedOnelink}`}
            className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <span>View Creator Pool</span>
          </Link>
        )}

        {/* Edit Button */}
        {authUser && (isInitialPage || authUser.email === profile.email) && (
          <Link
            to={`/${formatOnelink(authUser.onelink)}/edit`}
            className="p-3 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">Edit Page</span>
          </Link>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={handleSignIn}
          onCancel={handleCancelAuth}
          initialForm={initialAuthForm}
        />
      )}
    </div>
  );
}
