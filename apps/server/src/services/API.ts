import "express-async-errors";
import express, { type Application, type NextFunction, type Request, type Response } from "express";
import { env } from "../env";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { trpcMiddleware } from "../trpc/router";
import { auth } from "../utils/auth";
import { toNodeHandler } from "better-auth/node";
import wellKnownRouter from "../routes/well-known";

const app: Application = express();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [env.FRONTEND_URL];

      if (env.NODE_ENV === "development" || env.NODE_ENV === "testing") {
        allowedOrigins.push(
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:3000"
        );
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

const authHandler = toNodeHandler(auth);

app.use("/auth", (req, res) => {
  req.url = req.url.replace("/auth", "") || "/";
  return void authHandler(req, res);
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

app.use("/trpc", trpcMiddleware);
app.use("/.well-known", wellKnownRouter);

app.get("/", (req, res) => {
  res.redirect(env.FRONTEND_URL);
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
