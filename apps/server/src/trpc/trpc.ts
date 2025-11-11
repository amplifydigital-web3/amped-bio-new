import { initTRPC, TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ERROR_CAUSES } from "@ampedbio/constants";
import { JWT_KEYS } from "../utils/token";

// Define the user type from JWT token
export type JWTUser = {
  sub: number;
  email: string;
  role: string;
  wallet: string | null;
};

// Define the context that will be available in all procedures
export type Context = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user?: JWTUser;
  tokenExpired?: boolean;
};

// Create the context for each request
export const createContext = ({ req, res }: CreateExpressContextOptions): Context => {
  // Get the token from the Authorization header
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return {
      req,
      res,
    }; // No authenticated user
  }

  try {
    // Verify the token and get user data
    const jwtUser = jwt.verify(token, JWT_KEYS.publicKey, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;

    const user = {
      sub: parseInt(jwtUser.sub as string, 10), // Convert sub to number
      email: jwtUser.email as string,
      role: jwtUser.role as string,
      wallet: (jwtUser.wallet ?? null) as string | null,
    };

    return { req, res, user: user };
  } catch (error) {
    // Check if the error is due to token expiration
    if (error instanceof jwt.TokenExpiredError) {
      return { req, res, tokenExpired: true };
    }
    return { req, res }; // Invalid token
  }
};

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    // Ensure cause is properly serialized as a string when it's a known error cause
    let cause: unknown = error.cause;

    if (cause && typeof cause === "string" && Object.values(ERROR_CAUSES).includes(cause as any)) {
      // Keep the string as-is for known error causes
      // No change needed
    } else if (cause && typeof cause === "object" && Object.keys(cause as object).length === 0) {
      // If it's an empty object and the error message indicates token expiration,
      // set the proper error cause
      if (error.message?.toLowerCase().includes("token expired")) {
        cause = ERROR_CAUSES.TOKEN_EXPIRED;
      }
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        cause,
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
  if (ctx.tokenExpired) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Token expired",
      cause: ERROR_CAUSES.TOKEN_EXPIRED,
    });
  }

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No token provided",
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
    if (ctx.tokenExpired) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Token expired",
        cause: ERROR_CAUSES.TOKEN_EXPIRED,
      });
    }

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No token provided",
      });
    }

    const userRoleString = ctx.user.role || "";
    // Split the roles by comma and trim each role
    const userRoles = userRoleString
      .split(",")
      .map(role => role.trim())
      .filter(Boolean);

    // Check if the user has any of the required roles
    const hasRequiredRole =
      requiredRoles.length === 0 || requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Forbidden: Insufficient permissions",
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
export const createRoleProtectedProcedure = (roles: string[]) => t.procedure.use(hasRole(roles));

// Common role-protected procedures
export const adminProcedure = createRoleProtectedProcedure(["admin"]);
