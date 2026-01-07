import "express-async-errors";
import express, { type Application, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "../env";
import router from "../routes";
import { trpcMiddleware } from "../trpc/router";

const logTag = "[API]";

const app: Application = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

app.use("/trpc", trpcMiddleware);
app.use("/api/", router);

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
