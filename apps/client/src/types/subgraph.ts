import { RevoName } from "./rns/name";

export interface GetAllNamesResult {
  revoNames: RevoName[];
}

export type SubgraphResult<T> = {
  data: T | null;
  error: string | null;
};
