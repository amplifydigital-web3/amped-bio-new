// import { DI } from "./bootstrap";
// // the line below is necessary to make sure vercel recognizes this file as an edge function
// // eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
// import express from "express";

// export default DI.API.app;

// Use "type: module" in package.json to use ES modules
import express from "express";
const app = express();
const port = 3000;

// Define your routes
app.get("/", (req, res) => {
  res.json({ message: "Hello from Express on Vercel!" });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
