import express from "express";
import { adminController } from "../controllers/admin.controller";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply admin role requirement to all routes
router.use(authMiddleware("admin"));

// User management routes
router.get("/users", adminController.userList);
router.get("/users/:id", adminController.getUserById);
router.post("/users", adminController.createUser);
router.put("/users/:id", adminController.updateUser);

// Specialized user actions
router.patch("/users/:id/block", adminController.toggleUserBlock);
router.patch("/users/:id/role", adminController.changeUserRole);

export default router;
