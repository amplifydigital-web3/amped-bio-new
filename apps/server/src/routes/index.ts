import express, { Router } from "express";
import userRoutes from "./user.routes";
import themeRoutes from "./theme.routes";
import blockRoutes from "./block.routes";
import onelinkRoutes from "./onelink.routes";
import adminRoutes from "./admin.routes";

const router: Router = express.Router();

// Register all routes
router.use("/user", userRoutes);
router.use("/user/theme", themeRoutes);
router.use("/user/blocks", blockRoutes);
router.use("/onelink", onelinkRoutes);
router.use("/admin", adminRoutes);

export default router;
