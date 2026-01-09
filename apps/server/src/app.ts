import app from "./API";
import { env } from "./env";
import "./bootstrap";
// the line below is necessary to make sure vercel recognizes this file as an edge function
import express from "express";

void express;

app.listen(env.PORT, () => console.log(`listening on port: ${env.PORT}`));
