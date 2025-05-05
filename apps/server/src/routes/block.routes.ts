import express, { Router } from "express";
import { blockController } from "../controllers/block.controller";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validation.middleware";
import { editBlocksSchema, addBlockSchema, blockIdParamSchema } from "../schemas/block.schema";

const router: Router = express.Router();

// Block routes
router.put("/", authMiddleware(), validate(editBlocksSchema), blockController.editBlocks);
router.post("/", authMiddleware(), validate(addBlockSchema), blockController.addBlock);
router.get("/", authMiddleware(), blockController.getAll);
router.get("/block/:id", blockController.get);
router.delete("/block/:id", authMiddleware(), blockController.delete);

export default router;
