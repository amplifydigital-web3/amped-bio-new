import { Router } from "express";
import { JWT_KEYS } from "../utils/auth";

const wellKnownRouter: Router = Router();

wellKnownRouter.get("/jwks.json", async (req, res) => {
  const jwk = JWT_KEYS.publicKey.export({ format: "jwk" });

  jwk.alg = JWT_KEYS.alg;
  jwk.use = "sig";
  jwk.kid = JWT_KEYS.kid;

  res.json({
    keys: [jwk],
  });
});

export default wellKnownRouter;
