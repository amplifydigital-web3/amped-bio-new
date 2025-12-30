import { initTRPC, TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { auth } from "../utils/auth";

export type SessionUser = {
  sub: number;
  email: string;
  role: string;
  wallet: string | null;
};

export type Context = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user?: SessionUser;
};

// Create the context for each request
export const createContext = async ({
  req,
  res,
}: CreateExpressContextOptions): Promise<Context> => {
  // Validate session using better-auth (reads from cookies)
  const session = await auth.api.getSession({
    headers: req.headers as any,
  });

  if (session?.user) {
    return {
      req,
      res,
      user: {
        sub: parseInt(session.user.id, 10),
        email: session.user.email,
        role: session.user.role || "user",
        wallet: null,
      },
    };
  }

  return {
    req,
    res,
  };
};

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

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
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  }
  return next();
});

// Middleware to check if user has required roles
const hasRole = (requiredRoles: string[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
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

    return next();
  });

// Create a protected procedure that requires authentication
export const privateProcedure = t.procedure.use(isAuthed);

// Create a role-protected procedure that requires specific roles
export const createRoleProtectedProcedure = (roles: string[]) => t.procedure.use(hasRole(roles));

// Common role-protected procedures
export const adminProcedure = createRoleProtectedProcedure(["admin"]);
