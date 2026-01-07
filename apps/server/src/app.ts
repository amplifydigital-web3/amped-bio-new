/* eslint-disable @typescript-eslint/ban-ts-comment */
import { API } from "./services/API";
import { IDI } from "./types/di";
// eslint-disable-next-line unused-imports/no-unused-imports, @typescript-eslint/no-unused-vars
import express from "express";
// import { exec } from "child_process";

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// exec("npx prisma migrate deploy", (error, stdout, stderr) => {
//   if (error) {
//     console.error(`Migration error: ${error.message}`);
//     return;
//   }
//   if (stderr) {
//     console.error(`stderr: ${stderr}`);
//   }
//   console.log(`stdout: ${stdout}`);
// });

export const DI = {} as IDI;

DI.API = new API(DI);

export default DI.API.app;

const startServer = async () => {
  await DI.API.start();
};

if (module.parent === null) {
  startServer();
}
