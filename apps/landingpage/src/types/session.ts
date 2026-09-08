export interface EnrichedSessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  handle?: string | null;
  role?: string;
  twoFactorEnabled?: boolean;
  wallet?: string | null;
  poolAddresses?: Record<string, string>;
}
