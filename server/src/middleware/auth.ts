import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded as { id: string; email: string; role?: string };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const roleCheck = (...requiredRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // If no specific roles are required, just pass through
    // since the user is already authenticated
    if (requiredRoles.length === 0) {
      return next();
    }

    // Ensure user exists on request (should be set by authMiddleware)
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // If user has no role or role doesn't match any required roles
    const userRole = req.user.role || '';
    const hasRequiredRole = requiredRoles.includes(userRole);

    if (!hasRequiredRole) {
      return res.status(403).json({
        message: 'Forbidden: Insufficient permissions',
      });
    }

    next();
  };
};
