import express, { Router } from "express";
import adminRoutes from "./admin.routes";

const router: Router = express.Router();

// Register all routes
router.use("/admin", adminRoutes);

export default router;
