import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/src/trpc";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL || "http://localhost:43000"}/trpc`,
    }),
  ],
});
