import jwt from "jsonwebtoken";
import { env } from "../env";
import crypto from "crypto";

const pk = crypto.createPrivateKey({
  key: Buffer.from(env.JWT_PRIVATE_KEY, "utf8"),
  format: "pem",
  type: "pkcs8",
});

const pb = crypto.createPublicKey(pk);

export const JWT_KEYS = {
  privateKey: pk,
  publicKey: pb,
  kid: crypto
    .createHash("sha256")
    .update(pb.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16), // Key ID for the JWT
};

export const generateAccessToken = (user: {
  id: number;
  email: string;
  role: string;
  wallet: string | null;
}): string => {
  return jwt.sign(
    {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      wallet: user.wallet || null,
      aud: env.JWT_AUDIENCE, // Audience of the token
      iss: env.JWT_ISSUER, // Issuer of the token
    },
    JWT_KEYS.privateKey,
    {
      expiresIn: "10m", // 10 minutes
      algorithm: "RS256",
      keyid: JWT_KEYS.kid,
    }
  );
};
