import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { captcha, jwt, oneTap } from "better-auth/plugins";
import { env } from "../env";

const prisma = new PrismaClient();
export const auth = betterAuth({
  trustedOrigins: [env.FRONTEND_URL],
  plugins: [
    captcha({
      provider: "google-recaptcha",
      secretKey: env.CAPTCHA_SECRET_KEY,
    }),
    jwt({
      jwks: {
        jwksPath: "/.well-known/jwks.json",
      },
    }),
    oneTap(),
  ],
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  advanced: {
    database: {
      useNumberId: true,
    },
  },
  user: {
    modelName: "User",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      name: "name",
      onelink: "onelink",
      role: "role",
      image: "image",
    },
    additionalFields: {
      onelink: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
      image: {
        type: "string",
        required: false,
        defaultValue: null,
      },
    },
  },
  session: {
    modelName: "Session",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
    modelName: "Account",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "Verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      clientId: env.GOOGLE_CLIENT_ID,
    },
  },
});
