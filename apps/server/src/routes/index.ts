import express, { Router } from "express";
import { toNodeHandler } from "better-auth/node";

import adminRoutes from "./admin.routes";
import { auth } from "../utils/auth";

const router: Router = express.Router();

// Register all routes
router.use("/admin", adminRoutes);
router.all("/auth/*", toNodeHandler(auth));

export default router;
