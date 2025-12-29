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
