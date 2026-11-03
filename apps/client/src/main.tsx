import "./index.css";
import { loadFeatureFlags } from "./config/featureFlags";

// Feature flags load before the app is imported, so every module level flag
// read sees the admin's rows (config/featureFlags.ts).
void loadFeatureFlags()
  .then(() => import("./renderApp"))
  .then(({ renderApp }) => renderApp());
