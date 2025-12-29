import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { captcha, jwt, oneTap } from "better-auth/plugins";
import { env } from "../env";
import { processEmailToUniqueHandle } from "./onelink-generator";
import { sendEmailVerification } from "./email/email";
import { hashPassword, verifyPassword } from "./password";

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
      // generateId: options => {
      //   // Let the database auto-generate IDs for 'user' and 'users' tables
      //   if (options.model === "user" || options.model === "users") {
      //     return false;
      //   }
      //   // Generate UUIDs for all other tables
      //   return crypto.randomUUID();
      // },
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    emailVerification: {
      // Required to send the verification email
      sendVerificationEmail: async ({ user, url, token }: { user: any; url: any; token: any }) => {
        console.info("Sending email verification to:", JSON.stringify({ user, url, token }));
        sendEmailVerification(user.email, token);
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 1 * 60 * 60, // 1 hour
    },
    modelName: "User",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      name: "name",
      handle: "handle",
      role: "role",
      image: "image",
    },
    additionalFields: {
      handle: {
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
    beforeCreate: async (user: any, context: any) => {
      // Generate unique handle for social auth users who don't have one
      if (!user.handle && user.email) {
        user.handle = await processEmailToUniqueHandle(user.email);
      }

      // For social providers (like Google), use the name from the provider
      if (context?.provider === "google" && context?.profile?.name && !user.name) {
        user.name = context.profile.name;
      }
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
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  socialProviders: {
    google: {
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      clientId: env.GOOGLE_CLIENT_ID,
    },
  },
});
