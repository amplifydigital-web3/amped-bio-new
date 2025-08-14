export type AuthUser = {
  id: number;
  email: string;
  onelink: string;
  role: string; // User role (admin, user, etc.)
  // emailVerified: boolean;
  image: string | null; // User profile image URL
};
