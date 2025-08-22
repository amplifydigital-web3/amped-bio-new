import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWTUser } from "../trpc/trpc";
import { JWT_KEYS } from "../utils/token";

declare global {
  namespace Express {
    // export interface Locals {
    // user?: JWTUser;
    // }
    export interface Request {
      user: JWTUser;
    }
  }
}

// express middleware
export const authMiddleware = (...requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, JWT_KEYS.publicKey, {
        algorithms: ["RS256"],
      }) as jwt.JwtPayload;
      req.user = decoded as unknown as JWTUser;
      req.user.sub = parseInt(req.user.sub.toString(), 10); // Ensure sub is a number

      // If no specific roles are required, just proceed
      // since the user is already authenticated
      if (requiredRoles.length === 0) {
        return next();
      }

      // Check if user has required role
      const userRole = req.user.role || "";
      const hasRequiredRole = requiredRoles.includes(userRole);

      if (!hasRequiredRole) {
        return res.status(403).json({
          message: "Forbidden: Insufficient permissions",
        });
      }

      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};
