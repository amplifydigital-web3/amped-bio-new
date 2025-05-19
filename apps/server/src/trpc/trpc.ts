import { initTRPC, TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";

// Define the user type from JWT token
export type JWTUser = {
  id: number;
  email: string;
  role?: string;
};

// Define the context that will be available in all procedures
export type Context = {
  user?: JWTUser;
};

// Create the context for each request
export const createContext = ({ req }: CreateExpressContextOptions): Context => {
  // Get the token from the Authorization header
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return {}; // No authenticated user
  }
  
  try {
    // Verify the token and get user data
    const user = jwt.verify(token, env.JWT_SECRET) as JWTUser;
    return { user };
  } catch (error) {
    return {}; // Invalid token
  }
};

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        cause: error.cause,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware to check if user is authenticated
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No token provided',
    });
  }
  return next({
    ctx: {
      // Add user data to context
      user: ctx.user,
    },
  });
});

// Middleware to check if user has required roles
const hasRole = (requiredRoles: string[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'No token provided',
      });
    }

    const userRoleString = ctx.user.role || "";
    // Split the roles by comma and trim each role
    const userRoles = userRoleString.split(',').map(role => role.trim()).filter(Boolean);

    // Check if the user has any of the required roles
    const hasRequiredRole = requiredRoles.length === 0 || 
      requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Forbidden: Insufficient permissions',
      });
    }

    return next({
      ctx: {
        user: ctx.user,
      },
    });
  });

// Create a protected procedure that requires authentication
export const privateProcedure = t.procedure.use(isAuthed);

// Create a role-protected procedure that requires specific roles
export const createRoleProtectedProcedure = (roles: string[]) => 
  t.procedure.use(hasRole(roles));

// Common role-protected procedures
export const adminProcedure = createRoleProtectedProcedure(['admin']);
