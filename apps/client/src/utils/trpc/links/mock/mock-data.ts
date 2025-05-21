import { BlockType, User, LinkBlock, MediaBlock, TextBlock } from "@/api/api.types";

// Demo user for authentication
export const demoUser = {
  id: 1,
  email: "demo@example.com",
  onelink: "demouser",
  name: "Demo User",
  description: "This is a demo user profile for testing",
  image: "https://i.pravatar.cc/300",
  role: "user",
  block: "no",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  email_verified_at: new Date().toISOString(),
  reward_business_id: null,
};

// Create a user object that follows the User type
const typedUser: User = {
  id: demoUser.id,
  email: demoUser.email,
  onelink: demoUser.onelink,
};

// Mock data for responses
export const mockData = {
  auth: {
    login: {
      success: true,
      user: typedUser,
      token: "demo-auth-token",
    },
    register: {
      success: true,
      user: typedUser,
      token: "demo-auth-token",
    },
    passwordResetRequest: {
      success: true,
      message: "Password reset email sent",
      email: demoUser.email,
    },
    processPasswordReset: {
      success: true,
      message: "Password has been reset successfully",
    },
    verifyEmail: {
      success: true,
      message: "Email verified successfully",
      onelink: demoUser.onelink,
      email: demoUser.email,
    },
  },
  user: {
    initiateEmailChange: {
      success: true,
      message: "Verification code sent to your email",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    confirmEmailChange: {
      success: true,
      message: "Email address has been successfully updated",
      token: "demo-auth-token-updated",
    },
    resendEmailVerification: {
      success: true,
      message: "New verification code sent to your email",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    requestPresignedUrl: {
      presignedUrl: "https://demo-upload-url.com",
      fileKey: "demo-upload-key",
      expiresIn: 300,
    },
    confirmProfilePictureUpload: {
      success: true,
      profilePictureUrl: "https://i.pravatar.cc/300",
    },
  },
  onelink: {
    getOnelink: {
      user: {
        name: demoUser.name,
        email: demoUser.email,
        description: demoUser.description,
        image: demoUser.image,
      },
      theme: {
        id: 1,
        name: "Default Theme",
        config: {
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          primaryColor: "#ffffff",
          secondaryColor: "#f8f9fa",
          fontFamily: "Inter, sans-serif",
        },
      },
      blocks: [
        {
          id: 1,
          type: "text",
          order: 1,
          clicks: 0,
          user_id: demoUser.id,
          config: { content: "Demo Profile", platform: "header" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as TextBlock,
        {
          id: 2,
          type: "text",
          order: 2,
          clicks: 0,
          user_id: demoUser.id,
          config: { content: "This is a demo profile in DEMO mode", platform: "paragraph" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as TextBlock,
        {
          id: 3,
          type: "link",
          config: {
            url: "https://example.com",
            label: "Example Website",
            platform: "custom",
          },
          order: 3,
          clicks: 5,
          user_id: demoUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as LinkBlock,
        {
          id: 4,
          type: "media",
          config: {
            platform: "twitter",
            url: "https://twitter.com/demouser",
            label: "@demouser",
          },
          order: 4,
          user_id: demoUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as MediaBlock,
      ] as BlockType[],
    },
  },
  admin: {
    updateUser: {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      onelink: demoUser.onelink,
      role: demoUser.role,
      block: demoUser.block,
    },
    getUsers: {
      users: [demoUser],
      pagination: {
        total: 1,
        pages: 1,
        page: 1,
        limit: 10,
      },
    },
    getUserDetails: {
      ...demoUser,
      blocks: [],
      themes: [],
      _count: {
        blocks: 4,
        themes: 1,
      },
    },
    getBlockStats: {
      totalBlocks: 4,
      blocksCreatedToday: 4,
      averageBlocksPerUser: 4,
      blocksByType: [
        { type: "HEADER", count: 1 },
        { type: "TEXT", count: 1 },
        { type: "LINK", count: 1 },
        { type: "SOCIAL", count: 1 },
      ],
      popularBlockTypes: [
        { type: "SOCIAL", totalClicks: 10 },
        { type: "LINK", totalClicks: 5 },
        { type: "HEADER", totalClicks: 0 },
        { type: "TEXT", totalClicks: 0 },
      ],
    },
    getTopOnelinks: [
      {
        userId: demoUser.id,
        name: demoUser.name,
        onelink: demoUser.onelink,
        totalClicks: 15,
        blockCount: 4,
      },
    ],
    searchUsers: [demoUser],
    getDashboardStats: {
      userStats: {
        totalUsers: 1,
        newThisWeek: 1,
        rewardProgramUsers: 0,
        rewardProgramPercentage: 0,
      },
      blockStats: {
        totalBlocks: 4,
        blocksCreatedToday: 4,
        averageBlocksPerUser: 4,
        mostPopularBlockType: "SOCIAL",
      },
    },
  },
};
