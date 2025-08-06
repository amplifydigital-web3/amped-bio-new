import { createExpressMiddleware } from "@trpc/server/adapters/express";
import mergedRouter from "./index";
import { createContext } from "./trpc";

// Create Express middleware adapter
export const trpcMiddleware = createExpressMiddleware({
  router: mergedRouter,
  createContext,
});
