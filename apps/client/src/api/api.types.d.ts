import { PlatformId as LinkBlockPlatform } from "@/utils/platforms";

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
  // emailVerified?: boolean;
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

export interface AddBlockData {
  type: BaseBlockType;
  order?: number;
  config: any;
}

// Onelink-related types
export interface OnelinkRedemptionResponse {
  success: boolean;
  message: string;
  onelink?: string;
}

export interface OnelinkAvailabilityResponse {
  available: boolean;
  onelink: string;
}

type BaseBlockType = "link" | "media" | "text";

export type BaseBlock<type extends BaseBlockType = any, T = any> = {
  id: number;
  user_id?: number;
  type: type;
  order: number;
  config: T;
  created_at?: string;
  updated_at?: string | null;
};

export type LinkBlock = BaseBlock<
  "link",
  { platform: LinkBlockPlatform; url: string; label: string }
>;

export type MediaBlockPlatform =
  | "spotify"
  | "instagram"
  | "youtube"
  | "twitter"
  | "token-price"
  | "nft-collection"
  | "uniswap"
  | "substack"
  | "creator-pool";

export type MediaBlock = BaseBlock<
  "media",
  {
    content?: string;
    platform: MediaBlockPlatform;
    url: string;
    label: string;
  }
>;

export type TextBlock = BaseBlock<
  "text",
  {
    content: string;
    platform: string;
  }
>;

export type BlockType = LinkBlock | MediaBlock | TextBlock;

export interface OnelinkResponse {
  result: {
    user: {
      name: string;
      email: string;
      description: string;
      image: string;
    };
    theme: any;
    blocks: BlockType[];
  };
}
