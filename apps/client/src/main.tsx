import "./index.css";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./utils/trpc/trpc.ts";
import App from "./App.tsx";
import { AppProviders } from "./providers/AppProviders.tsx";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <AppProviders>
      <App />
    </AppProviders>
  </QueryClientProvider>
);
