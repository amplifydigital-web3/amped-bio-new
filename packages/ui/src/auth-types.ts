export type AuthUser = {
  id: number;
  email: string;
  handle: string;
  role: string;
  image: string | null;
  wallet: string | null;
  poolAddresses: Record<string, string>;
  twoFactorEnabled: boolean;
  /** From the session; undefined when the source did not say (QA-035) */
  emailVerified?: boolean;
};
