import "express-async-errors";
import express, { type Application, type NextFunction, type Request, type Response } from "express";
import { env } from "../env";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { trpcMiddleware } from "../trpc/router";
import wellKnownRouter from "../routes/well-known";
import blocksSchemasRouter from "../routes/blocks-schemas";
import healthRouter from "../routes/health";
import mcpRouter from "../routes/mcp";

const app: Application = express();

// Origins allowed to send credentialed (cookie carrying) requests.
const allowedOrigins = env.CORS_ORIGINS.split(",").map(o => o.trim());

if (env.APP_ENV === "development" || env.APP_ENV === "testing") {
  allowedOrigins.push(
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://[::1]:5173",
    "http://[::1]:5174",
    "http://[::1]:3000"
  );
}

const isLocalOrigin = (origin: string) =>
  origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes("::1");

const isAllowedOrigin = (origin: string) =>
  allowedOrigins.includes(origin) ||
  ((env.APP_ENV === "development" || env.APP_ENV === "testing") && isLocalOrigin(origin));

const apiCors = cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
});

app.use(apiCors);

// Model Context Protocol endpoint bound to the protected resource published at
// /.well-known/oauth-protected-resource/mcp. Registered before the JSON body
// parser because it reads the raw request stream itself.
app.use("/mcp", mcpRouter);

// Protected resource metadata (RFC 9728) for MCP clients.
// Tells clients that the authorization server is at auth.amped.bio.
// This is served BEFORE the body parser because Better Auth needs the raw body.
app.get(
  [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ],
  (req, res) => {
    const authOrigin = env.BETTER_AUTH_URL
      ? env.BETTER_AUTH_URL.replace(/\/+$/, "")
      : `${req.protocol}://${req.get("host")}`;
    // Redirect to the auth subdomain which serves the actual metadata
    return res.redirect(302, `${authOrigin}${req.path}`);
  }
);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/trpc", trpcMiddleware as any);
app.use("/.well-known", wellKnownRouter);
app.use("/api/blocks/schemas", blocksSchemasRouter);
app.use("/health", healthRouter);

app.get("/", (req, res) => {
  res.redirect(env.APP_URL);
});

function logErrors(err: any, req: Request, res: Response, next: NextFunction) {
  if (err.code !== 401)
    console.error(req.headers["x-forwarded-for"] || req.connection.remoteAddress, err);
  next(err);
}

function handleErrors(err: any, req: Request, res: Response, next?: NextFunction) {
  if (typeof err.code === "number") {
    return res.status(err.code).send({
      message: err.message || err,
    });
  }

  return res.status(500).json({ message: "Something went wrong!" });
}

app.use(logErrors);
app.use(handleErrors);

export default app;