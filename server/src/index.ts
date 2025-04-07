import { API } from './services/API';
import { IDI } from './types/di';

export const DI = {} as IDI;

const main = async () => {
  DI.API = new API(DI);

  await DI.API.start();
};

main();
