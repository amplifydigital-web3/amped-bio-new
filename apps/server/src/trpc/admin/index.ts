import { router } from "../trpc";
import { usersRouter } from "./users";
import { blocksRouter } from "./blocks";
import { themesRouter } from "./themes";
import { dashboardRouter } from "./dashboard";
import { filesRouter } from "./files";
import { adminUploadRouter } from "./upload";
import { walletAdminRouter } from "./wallet";
import { settingsRouter } from "./settings";
import { adminPoolsRouter } from "./pools";
import { affiliateAdminRouter } from "./affiliate";
import { oauthAppsAdminRouter } from "./oauthApps";
import { broadcastsAdminRouter } from "./broadcasts";

export const adminRouter = router({
  // User Management
  users: usersRouter,

  // Block Management & Statistics
  blocks: blocksRouter,

  // Theme Management
  themes: themesRouter,

  // Dashboard Statistics
  dashboard: dashboardRouter,

  // File Management
  files: filesRouter,

  // Upload Management (Admin Only)
  upload: adminUploadRouter,

  // Wallet Management (Admin Only)
  wallet: walletAdminRouter,

  // Site Settings
  settings: settingsRouter,

  // Pool Management
  pools: adminPoolsRouter,

  // Creator Pool Broadcast review and pilot (Build Board #1)
  broadcasts: broadcastsAdminRouter,

  // Affiliate Rewards Management
  affiliate: affiliateAdminRouter,

  // OAuth Applications
  oauthApps: oauthAppsAdminRouter,
});
