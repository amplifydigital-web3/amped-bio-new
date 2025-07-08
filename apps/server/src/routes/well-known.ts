import { Router } from "express";
import { privateKeyBuffer } from "../env";
import crypto from "crypto";

const router: Router = Router();

const privateKey = crypto.createPrivateKey({
  key: privateKeyBuffer,
  format: "pem",
  type: "pkcs8",
});

const publicKey = crypto.createPublicKey(privateKey);

router.get("/jwks.json", async (req, res) => {
  const jwk = publicKey.export({ format: "jwk" }) as any;

  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = crypto
    .createHash("sha256")
    .update(publicKey.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16);

  res.json({
    keys: [jwk],
  });
});

export default router;
