export type AuthUser = {
  id: number;
  email: string;
  handle: string;
  role: string; // User role (admin, user, etc.)
  // emailVerified: boolean;
  image: string | null; // User profile image URL
  wallet: string | null; // User wallet address
  poolAddresses: Record<string, string>; // chainId → poolAddress for confirmed creator pools
};
