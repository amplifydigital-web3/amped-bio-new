export type LoginData = {
  email: string;
  password: string;
};

export type RegisterData = {
  onelink: string;
  email: string;
  password: string;
};

export type DeleteData = {
  id: string;
  password: string;
};

// Auth Response Types
export type User = {
  id: number;
  email: string;
  onelink: string;
  emailVerified?: boolean;
};

export type AuthResponse = {
  success: boolean;
  message?: string;
  user: User;
  token: string;
};

export type EmailVerificationRequest = {
  email: string;
};

export type EmailVerificationResponse = {
  success: boolean;
  message: string;
  results?: any;
  email?: string;
};

export type PasswordResetRequest = {
  email: string;
};

export type PasswordResetResponse = {
  success: boolean;
  message: string;
  email?: string;
  error?: string;
};

export type ProcessPasswordResetRequest = {
  token: string;
  password: string;
  confirmPassword: string;
};

export type VerifyEmailResponse = {
  success: boolean;
  message: string;
  onelink?: string;
  email?: string;
};

// Block-related types
export interface BlockResponse {
  message: string;
  result: {
    id: number;
    user_id: number;
    type: string;
    order: number;
    config: any;
    created_at: string;
    updated_at: string | null;
  };
}

export interface BlockData {
  type: string;
  order?: number;
  [key: string]: any;
}
