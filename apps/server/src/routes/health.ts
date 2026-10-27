import { Router } from "express";

const healthRouter: Router = Router();

// Liveness probe for container orchestrators (see apps/server/Dockerfile).
// Keep it dependency-free: no auth, database or third-party calls, so a failure
// always means the HTTP server itself is no longer serving requests.
healthRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

export default healthRouter;
