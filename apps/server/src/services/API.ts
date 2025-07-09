import "express-async-errors";
import { IDI } from "../types/di";
import { Service } from "../types/service";
import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "../env";
import { Server } from "http";
import router from "../routes";
import { trpcMiddleware } from "../trpc/router";
import wellKnownRoutes from "../routes/well-known";

const logTag = "[API]";

export class API implements Service {
  public app: Application;
  private di: IDI;

  private server!: Server;

  constructor(di: IDI) {
    this.app = express();
    this.di = di;
  }

  async start() {
    this.app.use(helmet());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());

    this.app.use((req, res, next) => {
      res.locals = {
        di: this.di,
      };
      next();
    });

    this.app.use(
      cors({
        credentials: true, // Enable cookies in CORS requests
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin) return callback(null, true);

          const allowedOrigins = [
            env.FRONTEND_URL, // Use environment-specific frontend URL
          ];

          console.log(
            `CORS debug - NODE_ENV: ${env.NODE_ENV}, FRONTEND_URL: ${env.FRONTEND_URL}, Origin: ${origin}`
          );

          // Add additional origins based on environment
          if (env.NODE_ENV === "development") {
            allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
          }

          console.log("CORS debug - Allowed origins:", allowedOrigins);

          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
      })
    );

    // Mount the tRPC middleware
    this.app.use("/trpc", trpcMiddleware);

    this.app.use("/api/", router);

    this.app.use("/.well-known", wellKnownRoutes);

    this.app.use(logErrors);
    this.app.use(handleErrors);

    this.server = this.app.listen(env.PORT, () =>
      console.log(logTag, `listening on port ${env.PORT}`)
    );
  }

  async stop() {
    if (!this.server) {
      return;
    }

    return new Promise<void>((resolve, reject) =>
      this.server.close(err => {
        if (err) {
          console.error(logTag, "error stopping server", err);
          reject(err);
        } else {
          console.log(logTag, "server stopped");
          resolve();
        }
      })
    );
  }
}

export function handleMessage(data: any, res: express.Response, message = "") {
  return res.json(data);
}

function logErrors(
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (err.code !== 401)
    console.error(req.headers["x-forwarded-for"] || req.connection.remoteAddress, err);
  next(err);
}

function handleErrors(
  err: any,
  req: express.Request,
  res: express.Response,
  next?: express.NextFunction
) {
  if (typeof err.code === "number") {
    return res.status(err.code).send({
      message: err.message || err,
    });
  }

  return res.status(500).json({ message: "Something went wrong!" });
}
