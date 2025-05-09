import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { JWTUser } from "../trpc/trpc";

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

export const authMiddleware = (...requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      req.user = decoded as JWTUser;

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
    } catch (error) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};
