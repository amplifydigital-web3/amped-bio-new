import { useEffect } from "react";
import { getCookie, setCookie } from "../utils/cookies";

export const useReferralHandler = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rParam = params.get("r");

    if (rParam) {
      try {
        const hexValue = rParam.startsWith("0x") ? rParam : `0x${rParam}`;
        const userIdDecimal = parseInt(hexValue, 16);

        if (!isNaN(userIdDecimal) && userIdDecimal > 0) {
          if (!getCookie("pendingReferrerId")) {
            setCookie("pendingReferrerId", userIdDecimal.toString(), 30);
          }
        }
      } catch (error) {
        console.error("Error parsing referral ID:", error);
      }
    }
  }, []);
};
