import express, { Router } from "express";
import onelinkRoutes from "./onelink.routes";
import adminRoutes from "./admin.routes";

const router: Router = express.Router();

// Register all routes
router.use("/onelink", onelinkRoutes);
router.use("/admin", adminRoutes);

export default router;
