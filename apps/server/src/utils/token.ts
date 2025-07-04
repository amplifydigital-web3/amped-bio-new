import jwt from "jsonwebtoken";
import { privateKeyBuffer } from "../env";

export const generateAccessToken = (user: {
  id: number;
  email: string;
  role: string;
}): string => {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      aud: "amped.bio",
      iss: "api.amped.bio",
    },
    privateKeyBuffer,
    {
      expiresIn: "10m", // 10 minutes
      algorithm: "RS256",
      keyid: "a3342c51fb359dd243bf4",
    }
  );
};
