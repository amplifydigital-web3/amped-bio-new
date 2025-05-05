import express, { Router } from "express";
import { onelinkController } from "../controllers/onelink.controller";
import { validate, ValidationTarget } from "../middleware/validation.middleware";
import { onelinkParamSchema, redeemOnelinkSchema } from "../schemas/onelink.schema";
import { authMiddleware } from "../middleware/auth";

const router: Router = express.Router();

// Onelink routes
router.get(
  "/:onelink",
  validate(onelinkParamSchema, ValidationTarget.Params),
  onelinkController.getOnelink
);

router.get(
  "/check/:onelink",
  validate(onelinkParamSchema, ValidationTarget.Params),
  onelinkController.checkOnelink
);

router.post(
  "/redeem",
  authMiddleware(),
  validate(redeemOnelinkSchema),
  onelinkController.redeemOnelink
);

export default router;
