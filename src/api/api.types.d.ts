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
    id: string;
    email: string;
    onelink: string;
    emailVerified?: boolean;
};

export type AuthResponse = {
    success: boolean;
    message?: string;
    user?: User;
    token?: string;
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
