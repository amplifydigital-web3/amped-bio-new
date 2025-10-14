// Define the unified schema for banner data (storage and presentation format)
// Note: This interface should match the Zod schema in apps/server/src/schemas/banner.ts
export interface BannerData {
  text: string;
  type: "info" | "warning" | "success" | "error";
  enabled: boolean;
  panel?:
    | "home"
    | "profile"
    | "reward"
    | "gallery"
    | "blocks"
    | "rewardPools"
    | "createRewardPool"
    | "leaderboard"
    | "rns"
    | "wallet"
    | "pay"
    | "account";
}