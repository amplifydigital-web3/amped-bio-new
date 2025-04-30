import jwt from "jsonwebtoken";
import { env } from "../env";

interface TokenUser {
  id: number;
  email: string;
}

export const generateToken = (user: TokenUser): string => {
  return jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: "7d",
  });
};
