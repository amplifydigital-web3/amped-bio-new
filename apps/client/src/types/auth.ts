export type AuthUser = {
  id: number;
  email: string;
  handle: string;
  role: string;
  image: string | null;
  wallet: string | null;
  poolAddresses: Record<string, string>;
  twoFactorEnabled: boolean;
};
