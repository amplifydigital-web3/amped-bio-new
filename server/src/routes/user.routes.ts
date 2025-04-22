import express from "express";
import { userController } from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth";
import { validate, ValidationTarget } from "../middleware/validation.middleware";
import { deleteUserSchema, editUserSchema } from "../schemas/user.schema";

const router = express.Router();

router.put("/", authMiddleware(), validate(editUserSchema), userController.edit);
router.get("/", authMiddleware(), userController.get);
router.delete("/", authMiddleware(), validate(deleteUserSchema), userController.delete);

export default router;
