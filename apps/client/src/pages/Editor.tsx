import { useParams, useLocation } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { useNavigate } from "react-router-dom";
import { normalizeOnelink, formatOnelink, isEquivalentOnelink } from "@/utils/onelink";
import { toast } from "react-hot-toast";
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";
import { useAccount } from "wagmi";
import { AUTH_CONNECTION, WALLET_CONNECTORS } from "@web3auth/modal";

export function Editor() {
  const {
    connect,
    connectTo,
    isConnected,
    connectorName,
    loading: connectLoading,
    error: connectError,
  } = useWeb3AuthConnect();
  // IMP START - Logout
  const {
    disconnect,
    loading: disconnectLoading,
    error: disconnectError,
  } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();
  const { address } = useAccount();

  useEffect(() => {
    console.info("Web3Auth User Info:", userInfo);
    console.info("Wagmi Address:", address);
  }, [userInfo, address]);

  useEffect(() => {
    if (!isConnected) {
      // connect();

      connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        idToken: localStorage.getItem("amped-bio-auth-token")!,
        authConnectionId: "w3a-node-demo",
        // extraLoginOptions: {
        //   isUserIdCaseSensitive: false,
        // },
      });
    }
  }, [isConnected, connect, connectTo]);

  const { onelink = "" } = useParams();
  const { authUser, updateAuthUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const profile = useEditorStore(state => state.profile);
  const setUser = useEditorStore(state => state.setUser);
  const setActivePanel = useEditorStore(state => state.setActivePanel);
  const nav = useNavigate();
  const location = useLocation();

  // Normalize onelink to handle @ symbols in URLs
  const normalizedOnelink = normalizeOnelink(onelink);
  const formattedOnelink = formatOnelink(onelink);

  // Initialize Freshworks help widget
  useEffect(() => {
    // Set widget settings
    window.fwSettings = {
      widget_id: 154000003550,
    };

    // Initialize Freshworks Widget
    if (typeof window.FreshworksWidget !== "function") {
      const n = function (...args: any[]) {
        n.q.push(args);
      };
      n.q = [];
      window.FreshworksWidget = n;
    }

    // Load the script
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://widget.freshworks.com/widgets/154000003550.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    window.FreshworksWidget(
      "identify",
      "ticketForm",
      {
        name: authUser!.onelink,
        email: authUser!.email,
      },
      {
        formId: 1234, // Ticket Form ID
      }
    );

    // Cleanup function to remove the script when component unmounts
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      // Clean up the global variable
      delete window.FreshworksWidget;
      delete window.fwSettings;
    };
  }, []);

  // Redirect to URL with @ symbol if missing
  useEffect(() => {
    if (onelink && !onelink.startsWith("@")) {
      // Navigate to the same route but with @ symbol
      nav(`/@${onelink}/edit${location.search}`, { replace: true });
    }
  }, [onelink, nav, location.search]);

  // Check if user is allowed to edit this page
  useEffect(() => {
    const isLoggedIn = authUser !== null;

    if (!isLoggedIn) {
      // User is not logged in, redirect to view page
      toast.error("You need to log in to edit this page");
      nav(`/${formattedOnelink}`, { replace: true });
      return;
    }

    // Now check if logged-in user owns this onelink
    const isOwner = isEquivalentOnelink(authUser.onelink, normalizedOnelink);

    if (!isOwner) {
      // User is logged in but doesn't own this onelink
      toast.error("You cannot edit this page as it belongs to another user");
      nav(`/${formattedOnelink}`, { replace: true });
      return;
    }

    // User is authorized to edit
    setAuthorized(true);
  }, [normalizedOnelink, authUser, nav, formattedOnelink]);

  // Set active panel from location state or default to home
  useEffect(() => {
    // Check if a specific panel was passed in the navigation state
    if (location.state && location.state.panel) {
      setActivePanel(location.state.panel);
    } else if (authUser === null) {
      // For unauthenticated users, set to home
      setActivePanel("home");
    }
  }, [location.state, authUser, setActivePanel]);

  useEffect(() => {
    if (normalizedOnelink && normalizedOnelink !== profile.onelink) {
      setLoading(true);
      setUser(normalizedOnelink).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [normalizedOnelink, profile, setUser]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // Only render the editor if the user is authorized
  if (!authorized) {
    return null; // Render nothing while redirection happens
  }

  return (
    <div className="h-screen">
      <Layout onelink={normalizedOnelink} />
    </div>
  );
}
