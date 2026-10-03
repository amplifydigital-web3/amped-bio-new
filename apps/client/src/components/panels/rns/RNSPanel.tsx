import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { legacyRnsPath } from "@/contexts/RNSNavigationContext";

/**
 * Screen Review 101 I01: the separate RNS panel is gone. RNS is the third
 * Wallet tab; old /rns?t= links land on the matching Wallet view.
 */
export function RNSPanel() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("t");
    navigate(legacyRnsPath(t), { replace: true });
  }, [location.search, navigate]);

  return null;
}
