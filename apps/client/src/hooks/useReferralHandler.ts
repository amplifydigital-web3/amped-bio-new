import { useEffect } from "react";
import { getCookie, setCookie, eraseCookie } from "../utils/cookies";

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

  const getReferrerId = (): number | undefined => {
    const referrerIdFromCookie = parseInt(getCookie("pendingReferrerId") || "0");
    if (referrerIdFromCookie && !isNaN(referrerIdFromCookie) && referrerIdFromCookie > 0) {
      return referrerIdFromCookie;
    }
    return undefined;
  };

  const clearReferrerId = (): void => {
    eraseCookie("pendingReferrerId");
  };

  const overwriteReferrerId = (userId: number, days: number = 30): void => {
    clearReferrerId();
    setCookie("pendingReferrerId", userId.toString(), days);
  };

  const handleReferrerClick = (userId: number): void => {
    const userIdHex = `0x${userId.toString(16)}`;
    overwriteReferrerId(userId, 30);
    window.location.href = `/register?r=${userIdHex}`;
  };

  return {
    getReferrerId,
    clearReferrerId,
    handleReferrerClick,
  };
};
