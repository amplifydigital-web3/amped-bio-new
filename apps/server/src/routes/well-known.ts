import { Router } from "express";
import { JWT_KEYS } from "../utils/token";

const router: Router = Router();

router.get("/jwks.json", async (req, res) => {
  const jwk = JWT_KEYS.publicKey.export({ format: "jwk" }) as any;

  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = JWT_KEYS.kid;

  res.json({
    keys: [jwk],
  });
});

export default router;
