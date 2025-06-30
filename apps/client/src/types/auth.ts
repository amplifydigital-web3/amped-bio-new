export type AuthUser = {
  id: number;
  email: string;
  onelink: string;
  walletAddress: `0x${string}`; // Ethereum address of the user's wallet
  // emailVerified: boolean;
};
