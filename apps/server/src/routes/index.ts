import express, { Router } from "express";
import { toNodeHandler } from "better-auth/node";

import { auth } from "../utils/auth";

const router: Router = express.Router();

router.all("/auth/*", toNodeHandler(auth));

export default router;
