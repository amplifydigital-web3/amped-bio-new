import jwt from "jsonwebtoken";
import { env, privateKeyBuffer } from "../env";

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
      keyid: "a3342c51fb359dd243bf4",
    }
  );
};
