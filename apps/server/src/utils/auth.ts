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
      generateId: options => {
        // Let the database auto-generate IDs for 'user' and 'users' tables
        if (options.model === "user" || options.model === "users") {
          return false;
        }
        // Generate UUIDs for all other tables
        return crypto.randomUUID();
      },
    },
  },
  user: {
    modelName: "User",
    fields: {
      id: {
        required: false,
        type: "number",
      },
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
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
    modelName: "Account",
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
