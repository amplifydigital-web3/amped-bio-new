/* eslint-disable @typescript-eslint/ban-ts-comment */
import { API } from "./services/API";
import { IDI } from "./types/di";
import { exec } from "child_process";

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

exec("npx prisma migrate deploy", (error, stdout, stderr) => {
  if (error) {
    console.error(`Migration error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(`stdout: ${stdout}`);
});

export const DI = {} as IDI;

const app = async () => {
  DI.API = new API(DI);

  await DI.API.start();
};

export default app;
