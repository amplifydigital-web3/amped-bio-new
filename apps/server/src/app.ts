import app from "./services/API";
import "./bootstrap";
// the line below is necessary to make sure vercel recognizes this file as an edge function
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import express from "express";

export default app;
