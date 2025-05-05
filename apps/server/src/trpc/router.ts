import { createExpressMiddleware } from '@trpc/server/adapters/express';
import appRouter from "./onelink";

// Create Express middleware adapter
export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: () => ({}),
});