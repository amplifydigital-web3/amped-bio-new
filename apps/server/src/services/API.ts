import "express-async-errors";
import express, { type Application, type NextFunction, type Request, type Response } from "express";
import { env } from "../env";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { trpcMiddleware } from "../trpc/router";
import { auth, OAUTH_CONSENT_PATH, OAUTH_DEVICE_PATH, OAUTH_LOGIN_PATH } from "../utils/auth";
import { toNodeHandler } from "better-auth/node";
import wellKnownRouter, { jwksHandler } from "../routes/well-known";
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

// OAuth endpoints authenticate with PKCE, client secrets, bearer tokens or an
// initial access token instead of cookies, so third-party browser clients must
// be able to call them. Credentialed responses are reflected only for
// allowlisted origins; every other origin gets a credential-less wildcard.
// Cookie-authenticated endpoints (/oauth2/authorize, /oauth2/consent,
// /oauth2/continue) are intentionally excluded and stay on the strict allowlist.
const OAUTH_CORS_PATHS = new Set([
  "/auth/oauth2/token",
  "/auth/oauth2/introspect",
  "/auth/oauth2/revoke",
  "/auth/oauth2/userinfo",
  "/auth/oauth2/register",
  "/auth/device/code",
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (!origin) return next();

  const isOAuthEndpoint = OAUTH_CORS_PATHS.has(req.path);
  const isOAuthMetadata =
    req.path.startsWith("/.well-known/oauth-") || req.path.startsWith("/.well-known/openid-configuration");

  if (!isOAuthEndpoint && !isOAuthMetadata) return next();

  const reflectOrigin = isOAuthEndpoint && isAllowedOrigin(origin);

  res.setHeader("Access-Control-Allow-Origin", reflectOrigin ? origin : "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, DPoP");
  res.setHeader("Access-Control-Max-Age", "600");

  if (reflectOrigin) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  // Skip the allowlist based CORS middleware for the paths handled above.
  res.locals.oauthCorsHandled = true;

  if (req.method === "OPTIONS") return res.status(204).end();

  return next();
});

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

app.use((req: Request, res: Response, next: NextFunction) => {
  if (res.locals.oauthCorsHandled) return next();
  return apiCors(req, res, next);
});

const authHandler = toNodeHandler(auth);

// Better Auth resolves the OAuth login/consent/verification pages against the
// API origin. Redirect them to the landing page, forwarding the signed OAuth
// query string untouched so the flow can continue.
const OAUTH_PAGE_REDIRECTS: Record<string, string> = {
  [OAUTH_LOGIN_PATH]: "/oauth/login",
  [OAUTH_CONSENT_PATH]: "/oauth/consent",
  [OAUTH_DEVICE_PATH]: "/oauth/device",
};

app.get(Object.keys(OAUTH_PAGE_REDIRECTS), (req: Request, res: Response) => {
  const target = OAUTH_PAGE_REDIRECTS[req.path];
  const queryIndex = req.originalUrl.indexOf("?");
  const search = queryIndex === -1 ? "" : req.originalUrl.slice(queryIndex);

  return res.redirect(302, `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}${target}${search}`);
});

// `jwks.remoteUrl` tells the JWT plugin that key material lives outside the
// plugin, which makes its own `/jwks` endpoint answer 404. Token verification
// still fetches that path, so serve the same key set here.
app.get("/auth/jwks", jwksHandler);

// Model Context Protocol endpoint bound to the protected resource published at
// /.well-known/oauth-protected-resource/mcp. Registered before the JSON body
// parser because it reads the raw request stream itself.
app.use("/mcp", mcpRouter);

// The issuer lives under the `/auth` base path, so the handler receives the
// request with its prefix intact (Better Auth 1.7 routes on the base path).
app.use("/auth", (req, res) => {
  return void authHandler(req, res);
});

// Documents that belong at the API origin root:
// - the RFC 8414 authorization server metadata form for issuers with a path
//   (`/.well-known/oauth-authorization-server/auth`),
// - the RFC 9728 protected resource metadata MCP clients fetch before they
//   know the issuer.
app.get(
  [
    "/.well-known/oauth-authorization-server/auth",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ],
  (req, res) => {
    return void authHandler(req, res);
  }
);

// Convenience aliases for clients that only probe the origin root.
app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (req, res) => {
  const issuer = env.BETTER_AUTH_URL
    ? `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/auth`
    : `${req.protocol}://${req.get("host")}/auth`;
  const document = req.path.endsWith("openid-configuration")
    ? "openid-configuration"
    : "oauth-authorization-server";

  return res.redirect(302, `${issuer}/.well-known/${document}`);
});

// app.get("/.well-known/jwks.json", (req, res) => {
//   req.url = "/auth/.well-known/jwks.json";
//   return void authHandler(req, res);
// });

app.use(helmet());
// Don’t use express.json() before the Better Auth handler. Use it only for other routes, or the client API will get stuck on "pending".
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
