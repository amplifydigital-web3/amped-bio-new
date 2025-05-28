import axios from "axios";
import type { Theme } from "../types/editor";
import { withRelatedProject } from "@vercel/related-projects";
import { normalizeOnelink } from "@/utils/onelink";
import type {
  DeleteData,
  BlockResponse,
  AddBlockData,
  OnelinkRedemptionResponse,
  OnelinkAvailabilityResponse,
  OnelinkResponse,
  BlockType,
} from "./api.types";

const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

// Create an Axios instance with default configuration
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? baseURL}/api`,
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
  const updatedUserData = {
    ...userData,
    onelink: normalizeOnelink(userData.onelink),
  };
  console.log("Editing user:", updatedUserData);
  return apiRequest(() => api.put("/user", updatedUserData), "User updated successfully:");
}

export async function getUser(userData: { token: string }) {
  console.log("Get user:", userData);
  const response = await apiRequest<any>(
    () =>
      api.get("/user", {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache", Expires: "0" },
      }),
    "User get:"
  );
  return response.result;
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

  return apiRequest<BlockResponse>(
    () => api.post("/user/blocks", block),
    "Block added successfully:"
  );
}

// Onelink APIs
export async function getOnelink(onelink: string) {
  const normalizedOnelink = normalizeOnelink(onelink);
  console.log("Get onelink:", normalizedOnelink);
  return apiRequest<OnelinkResponse>(
    () => api.get(`/onelink/${normalizedOnelink}`),
    "Onelink retrieved successfully:"
  ).then(data => data.result);
}

export async function checkOnelinkAvailability(onelink: string): Promise<boolean> {
  const normalizedOnelink = normalizeOnelink(onelink);
  console.log("Check onelink:", normalizedOnelink);
  return apiRequest<OnelinkAvailabilityResponse>(
    () => api.get(`/onelink/check/${normalizedOnelink}`),
    "Onelink availability checked:"
  ).then(data => data.available);
}

export async function redeemOnelink(newOnelink: string) {
  const normalizedNewOnelink = normalizeOnelink(newOnelink);
  console.log(`Redeeming onelink: changing to ${normalizedNewOnelink}`);
  return apiRequest<OnelinkRedemptionResponse>(
    () => api.post("/onelink/redeem", { newOnelink: normalizedNewOnelink }),
    "Onelink redemption process:"
  );
}
