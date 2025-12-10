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
});
