import app from "./services/API";
import { env } from "./env";
import "./bootstrap";

app.listen(env.PORT, () => console.log(`listening on port: ${env.PORT}`));
