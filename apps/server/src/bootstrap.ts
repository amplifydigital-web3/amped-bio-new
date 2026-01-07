import { API } from "./services/API";
import { IDI } from "./types/di";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export const DI = {} as IDI;

DI.API = new API(DI);
DI.API.setup();
