import jwt from "jsonwebtoken";
import { env } from "../env";
import crypto from "crypto";

const privateKeyBuffer = Buffer.from(env.JWT_PRIVATE_KEY, "utf8");

const pk = crypto.createPrivateKey({
  key: privateKeyBuffer,
  format: "pem",
  type: "pkcs8",
});

const pb = crypto.createPublicKey(pk);

export const JWT_KEYS = {
  privateKey: pk,
  publicKey: crypto.createPublicKey(pk),
  kid: crypto
    .createHash("sha256")
    .update(pb.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16), // Key ID for the JWT
};

export const generateAccessToken = (user: { id: number; email: string; role: string }): string => {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      aud: env.JWT_AUDIENCE, // Audience of the token
      iss: env.JWT_ISSUER, // Issuer of the token
    },
    privateKeyBuffer,
    {
      expiresIn: "10m", // 10 minutes
      algorithm: "RS256",
      keyid: JWT_KEYS.kid,
    }
  );
};
