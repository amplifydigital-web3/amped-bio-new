import "./index.css";
import { loadFeatureFlags } from "./config/featureFlags";
import { linkBaseFonts } from "./config/baseFonts";

// Feature flags load before the app is imported, so every module level flag
// read sees the admin's rows (config/featureFlags.ts). The base fonts follow
// the fontDelivery flag (config/baseFonts.ts) and do not hold up the app.
void loadFeatureFlags()
  .then(() => {
    void linkBaseFonts();
    return import("./renderApp");
  })
  .then(({ renderApp }) => renderApp());
