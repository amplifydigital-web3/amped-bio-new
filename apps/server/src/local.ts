import { env } from "./env";
import app from "./API";
import "./bootstrap";

app.listen(env.PORT, () => console.log(`listening on port ${env.PORT}`));
