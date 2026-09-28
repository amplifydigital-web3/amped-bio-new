import { Router, type Request, type Response } from "express";
import { JWT_KEYS } from "../utils/auth";

/**
 * The JWKS that verifies every token signed by this server. The key material
 * comes from `JWT_PRIVATE_KEY`, which is also what the JWT plugin signs with.
 */
export function jwksHandler(_req: Request, res: Response) {
  const jwk = JWT_KEYS.publicKey.export({ format: "jwk" });

  jwk["alg"] = JWT_KEYS.alg;
  jwk["use"] = "sig";
  jwk["kid"] = JWT_KEYS.kid;

  return res.json({
    keys: [jwk],
  });
}

const wellKnownRouter: Router = Router();

wellKnownRouter.get("/jwks.json", jwksHandler);

export default wellKnownRouter;