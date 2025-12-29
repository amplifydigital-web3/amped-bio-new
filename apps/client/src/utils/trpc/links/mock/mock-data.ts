import { BlockType, LinkBlock, MediaBlock, TextBlock } from "@ampedbio/constants";

// Demo user for authentication
export const demoUser = {
  id: 1,
  email: "demo@example.com",
  handle: "demouser",
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
const typedUser = {
  id: demoUser.id,
  email: demoUser.email,
  handle: demoUser.handle,
} as const;

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
      handle: demoUser.handle,
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
  },
  upload: {
    requestPresignedUrl: {
      presignedUrl: "https://demo-upload-url.com",
      fileId: 1,
      expiresIn: 300,
    },
    confirmProfilePictureUpload: {
      success: true,
      profilePictureUrl: "https://i.pravatar.cc/300",
      fileId: 1,
    },
  },
  handle: {
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
  theme: {
    editTheme: {
      id: 1,
      user_id: demoUser.id,
      name: "Demo Theme",
      share_level: "private",
      share_config: {},
      config: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        primaryColor: "#ffffff",
        secondaryColor: "#f8f9fa",
        fontFamily: "Inter, sans-serif",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    deleteTheme: {
      id: 1,
      user_id: demoUser.id,
      name: "Demo Theme",
      share_level: "private",
      share_config: {},
      config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    getUserThemes: [
      {
        id: 1,
        user_id: demoUser.id,
        name: "Demo Theme",
        share_level: "private",
        share_config: {},
        config: {
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          primaryColor: "#ffffff",
          secondaryColor: "#f8f9fa",
          fontFamily: "Inter, sans-serif",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    applyTheme: {
      success: true,
      message: "Theme applied successfully",
      themeId: 1,
      themeName: "Demo Server Theme",
    },
  },
  themeGallery: {
    getTheme: {
      id: 1,
      user_id: demoUser.id,
      name: "Demo Public Theme",
      share_level: "public",
      share_config: {},
      config: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        primaryColor: "#ffffff",
        secondaryColor: "#f8f9fa",
        fontFamily: "Inter, sans-serif",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: {
        id: demoUser.id,
        name: demoUser.name,
        image: demoUser.image,
        image_file_id: null,
      },
      thumbnailImage: null,
    },
    getCollections: [
      {
        id: "1",
        name: "Demo Server Collection",
        description: "A sample server collection with demo themes",
        themeCount: 2,
        isServer: true,
        categoryImage: null,
      },
    ],
    getThemesByCategory: {
      category: {
        id: 1,
        name: "Demo Server Collection",
        description: "A sample server collection with demo themes",
        categoryImage: null,
      },
      themes: [
        {
          id: 1,
          user_id: null,
          name: "Demo Server Theme 1",
          share_level: "public",
          share_config: {},
          config: {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            primaryColor: "#ffffff",
            secondaryColor: "#f8f9fa",
            fontFamily: "Inter, sans-serif",
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user: null,
          thumbnailImage: null,
        },
        {
          id: 2,
          user_id: null,
          name: "Demo Server Theme 2",
          share_level: "public",
          share_config: {},
          config: {
            background: "linear-gradient(45deg, #ff6b6b 0%, #ffd93d 100%)",
            primaryColor: "#ffffff",
            secondaryColor: "#f8f9fa",
            fontFamily: "Inter, sans-serif",
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user: null,
          thumbnailImage: null,
        },
      ],
    },
  },
  admin: {
    updateUser: {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      handle: demoUser.handle,
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
        handle: demoUser.handle,
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
    createTheme: {
      id: 1,
      user_id: null,
      name: "Demo Admin Theme",
      share_level: "public",
      share_config: {},
      config: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        primaryColor: "#ffffff",
        secondaryColor: "#f8f9fa",
        fontFamily: "Inter, sans-serif",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    getCollections: [
      {
        id: "1",
        name: "Demo Server Collection",
        description: "A sample server collection with demo themes",
        themeCount: 2,
        isServer: true,
        categoryImage: null,
      },
    ],
    getThemesByCategory: {
      category: {
        id: 1,
        name: "Demo Server Collection",
        description: "A sample server collection with demo themes",
        categoryImage: null,
      },
      themes: [
        {
          id: 100,
          name: "Demo Server Theme 1",
          description: "A sample theme from the server",
          config: {
            background: {
              type: "gradient",
              value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            },
            primaryColor: "#ffffff",
            secondaryColor: "#f8f9fa",
            fontFamily: "Inter, sans-serif",
          },
          thumbnailImage: {
            id: 1,
            url: "https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?w=400",
          },
          share_level: "public",
          user: null,
        },
        {
          id: 101,
          name: "Demo Server Theme 2",
          description: "Another sample theme from the server",
          config: {
            background: {
              type: "gradient",
              value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            },
            primaryColor: "#ffffff",
            secondaryColor: "#f8f9fa",
            fontFamily: "Inter, sans-serif",
          },
          thumbnailImage: {
            id: 2,
            url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400",
          },
          share_level: "public",
          user: null,
        },
      ],
    },
    createThemeCategory: {
      id: 1,
      name: "Business",
      title: "Business Themes",
      category: "business",
      description: "Professional themes for business use",
      image: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    themes: {
      createThemeCategory: {
        id: 4,
        name: "tech",
        title: "Technology",
        category: "tech",
        description: "Modern themes for tech professionals",
        visible: false,
        image_file_id: null,
        image: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _count: {
          themes: 0,
        },
      },
      toggleThemeCategoryVisibility: {
        success: true,
        message: "Category visibility updated successfully",
        category: {
          id: 1,
          name: "business",
          title: "Business",
          visible: true,
        },
      },
    },
  },
};
