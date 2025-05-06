import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/src/trpc";
import { withRelatedProject } from "@vercel/related-projects";

const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: "http://localhost:43000",
});

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? baseURL}/trpc`,
    }),
  ],
});
