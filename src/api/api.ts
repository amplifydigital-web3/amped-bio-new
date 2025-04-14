import axios from "axios";
import type { Theme } from "../types/editor";
import { withRelatedProject } from "@vercel/related-projects";
import type {
  LoginData,
  RegisterData,
  DeleteData,
  AuthResponse,
  EmailVerificationResponse,
  PasswordResetResponse,
  VerifyEmailResponse,
  BlockResponse,
  AddBlockData,
  OnelinkRedemptionResponse,
  OnelinkAvailabilityResponse,
  OnelinkResponse,
  BlockType,
} from "./api.types";

const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: "http://localhost:43000",
});

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: `${baseURL}/api`,
});

// Add interceptor to automatically add authentication token to requests
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem("amped-bio-auth-token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Helper function to handle API errors consistently
async function apiRequest<T>(requestFn: () => Promise<any>, successMessage: string): Promise<T> {
  try {
    const response = await requestFn();
    console.log(successMessage, response.data);
    return response.data;
  } catch (error) {
    console.error(`API Error: ${successMessage}`, error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data.message ?? error.message);
    } else {
      throw error;
    }
  }
}

// Authentication APIs
export async function login(authData: LoginData): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(() => api.post("/auth/login", authData), "Login successful:");
}

export async function registerNewUser(userData: RegisterData): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(
    () => api.post("/auth/register", userData),
    "New User created successfully:"
  );
}

// Helper for POST requests with email parameter
async function emailBasedPostRequest<T>(
  endpoint: string,
  email: string,
  successMessage: string
): Promise<T> {
  return apiRequest<T>(() => api.post(endpoint, { email }), successMessage);
}

export async function resendEmailVerification(email: string): Promise<EmailVerificationResponse> {
  return emailBasedPostRequest<EmailVerificationResponse>(
    "/auth/sendEmailVerification",
    email,
    "Verification email sent:"
  );
}

export async function passwordResetRequest(email: string): Promise<PasswordResetResponse> {
  return emailBasedPostRequest<PasswordResetResponse>(
    "/auth/passwordResetRequest",
    email,
    "Password reset email sent:"
  );
}

export async function resendVerificationEmail(email: string): Promise<EmailVerificationResponse> {
  return emailBasedPostRequest<EmailVerificationResponse>(
    "/auth/sendEmailVerification",
    email,
    "Email verification resent:"
  );
}

export async function requestPasswordReset(email: string): Promise<PasswordResetResponse> {
  return emailBasedPostRequest<PasswordResetResponse>(
    "/auth/passwordResetRequest",
    email,
    "Password reset request response:"
  );
}

// These endpoints still use GET as they are retrieving information, not performing actions
export async function verifyEmail(token: string, email: string): Promise<VerifyEmailResponse> {
  return apiRequest<VerifyEmailResponse>(
    () => api.get(`/auth/verifyEmail/${token}?email=${encodeURIComponent(email)}`),
    "Email verification response:"
  );
}

export async function processPasswordReset(
  token: string,
  password: string
): Promise<PasswordResetResponse> {
  return apiRequest<PasswordResetResponse>(
    () =>
      api.post("/auth/passwordReset", {
        token,
        newPassword: password,
      }),
    "Password reset response:"
  );
}

// User APIs
export async function editUser(userData: {
  name: string;
  // TODO remove unused fields
  email: string;
  onelink: string;
  description: string;
  image: string;
  reward_business_id: string;
  theme: number;
}) {
  console.log("Editing user:", userData);
  return apiRequest(() => api.put("/user", userData), "User updated successfully:");
}

export async function getUser(userData: { token: string }) {
  console.log("Get user:", userData);
  return apiRequest<any>(
    () =>
      api.get("/user", {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" },
      }),
    "User get:"
  ).then(data => data.result);
}

export async function deleteUser(userData: DeleteData) {
  const { password } = userData;
  return apiRequest(
    () => api.delete("/user", { data: { password } }),
    "User deleted successfully:"
  );
}

// Theme and Block APIs
export async function editTheme(theme: Theme) {
  const { id } = theme;
  console.log("Editing Theme:", id);
  const res = await apiRequest<{
    result: {
      id: number;
      user_id: number;
      name: string;
      share_level: string;
      share_config: Map<string, any> | null;
      config: Map<string, any> | null;
      created_at: Date;
      updated_at: Date | null;
    };
  }>(() => api.put(`/user/theme/${id}`, { theme }), "Theme updated successfully:");

  return res.result;
}

export async function editBlocks(blocks: BlockType[]) {
  console.log("Editing user blocks");
  return apiRequest(() => api.put("/user/blocks", { blocks }), "User updated successfully:");
}

export async function deleteBlock(block_id: number) {
  console.log("Delete user block:", block_id);
  return apiRequest(
    () => api.delete(`/user/blocks/block/${block_id}`),
    "Block deleted successfully:"
  );
}

// Add a function to add a single block
export async function addBlock(block: AddBlockData): Promise<BlockResponse> {
  console.log("Adding new block:", block);

  // Extract type and order, move all other properties to config
  const { type, order, ...configData } = block;

  // Format the request according to the server's expected structure
  const payload = {
    type,
    order: order || 0,
    config: configData,
  };

  return apiRequest<BlockResponse>(
    () => api.post("/user/blocks", payload),
    "Block added successfully:"
  );
}

// Onelink APIs
export async function getOnelink(onelink: string) {
  const sanitizedOnelink = onelink.replace(/^@+/, "");
  console.log("Get onelink:", sanitizedOnelink);
  return apiRequest<OnelinkResponse>(
    () => api.get(`/onelink/${sanitizedOnelink}`),
    "Onelink retrieved successfully:"
  ).then(data => data.result);
}

export async function checkOnelinkAvailability(onelink: string): Promise<boolean> {
  console.log("Check onelink:", onelink);
  return apiRequest<OnelinkAvailabilityResponse>(
    () => api.get(`/onelink/check/${onelink}`),
    "Onelink availability checked:"
  ).then(data => data.available);
}

export async function redeemOnelink(newOnelink: string) {
  console.log(`Redeeming onelink: changing to ${newOnelink}`);
  return apiRequest<OnelinkRedemptionResponse>(
    () => api.post("/onelink/redeem", { newOnelink }),
    "Onelink redemption process:"
  );
}
