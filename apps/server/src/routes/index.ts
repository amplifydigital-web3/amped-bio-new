import express, { Router } from "express";

import { auth } from "../utils/auth";

const router: Router = express.Router();

router.all("/auth/*", async (req, res) => {
  const { toNodeHandler } = await import("better-auth/node");
  const authInstance = await auth;
  const handler = toNodeHandler(authInstance);
  return handler(req, res);
});

export default router;
