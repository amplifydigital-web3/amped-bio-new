import { API } from "./services/API";
import { IDI } from "./types/di";

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export const DI = {} as IDI;

const app = async () => {
  DI.API = new API(DI);

  await DI.API.start();
};

export default app;
