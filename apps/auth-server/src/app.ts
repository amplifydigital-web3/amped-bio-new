import app from "./services/API";
import { env } from "./env";
import "./bootstrap";

app.listen(env.PORT, () => console.log(`[auth-server] listening on port: ${env.PORT}, issuer: ${env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`}`));