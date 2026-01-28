import { prisma } from "../services/DB";
import { env } from "../env";
import { processEmailToUniqueHandle } from "./onelink-generator";
import { sendEmailVerification, sendPasswordResetEmail } from "./email/email";
import { hashPassword, verifyPassword } from "./password";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { captcha, jwt, customSession } from "better-auth/plugins";
import crypto from "crypto";
import { JWTPayload, SignJWT } from "jose";

// === jwt private key generation  ===
const pk = crypto.createPrivateKey({
  key: Buffer.from(env.JWT_PRIVATE_KEY, "utf8"),
  format: "pem",
  type: "pkcs8",
});

const pb = crypto.createPublicKey(pk);

export const JWT_KEYS = {
  alg: "RS256" as const,
  privateKey: pk,
  publicKey: pb,
  kid: crypto
    .createHash("sha256")
    .update(pb.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16), // Key ID for the JWT
  aud: env.JWT_AUDIENCE,
  iss: env.APP_ENV === "development" ? "staging-api.amped.bio" : env.API_HOST,
};

// ================ better-auth configuration ==================
export const auth = betterAuth({
  basePath: "/auth",
  trustedOrigins: [env.FRONTEND_URL],
  plugins: [
    customSession(async ({ user, session }) => {
      // Backfill handle for existing users without one
      const userHandle = (user as any).handle;
      if ((!userHandle || userHandle === "") && user.email) {
        const newHandle = await processEmailToUniqueHandle(user.email);
        await prisma.user.update({
          where: { id: parseInt(user.id) },
          data: { handle: newHandle },
        });
        (user as any).handle = newHandle;
      }

      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: parseInt(user.id) },
      });

      return {
        user: {
          ...user,
          wallet: userWallet?.address ?? null,
        },
        session,
      };
    }),
    captcha({
      provider: "google-recaptcha",
      secretKey: env.CAPTCHA_SECRET_KEY,
    }),
    jwt({
      disableSettingJwtHeader: true,
      jwt: {
        sign: async (jwtPayload: JWTPayload) => {
          return await new SignJWT(jwtPayload)
            .setIssuedAt()
            .setAudience(JWT_KEYS.aud)
            .setIssuer(JWT_KEYS.iss)
            .setProtectedHeader({
              alg: JWT_KEYS.alg,
              kid: JWT_KEYS.kid,
              typ: "JWT",
            })
            .sign(pk);
        },
      },
      jwks: {
        remoteUrl: new URL(
          "/.well-known/jwks.json",
          env.API_HOST.startsWith("http") ? env.API_HOST : `https://${env.API_HOST}`
        ).href,
        keyPairConfig: {
          alg: JWT_KEYS.alg,
        },
      },
    }),
    // oneTap(),
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
        input: false,
      },
      image: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      referredBy: {
        type: "number",
        required: false,
        defaultValue: null,
        input: true, // Allow to be passed in signup
      },
    },
    beforeCreate: async (user: any, context: any) => {
      // Generate unique handle for social auth users who don't have one
      if ((!user.handle || user.handle === "") && user.email) {
        user.handle = await processEmailToUniqueHandle(user.email);
      }

      // Process referral if provided
      if (user.referredBy) {
        // Validate that referrer exists
        const referrer = await prisma.user.findUnique({
          where: { id: user.referredBy },
          select: { id: true },
        });

        // If referrer doesn't exist, remove field silently
        if (!referrer) {
          delete user.referredBy;
        }
      }

      // For social providers (like Google), use the name from the provider
      if (context?.provider === "google" && context?.profile?.name && !user.name) {
        user.name = context.profile.name;
      }
    },
    afterCreate: async (user: any) => {
      // Create referral record if has a referrer
      if (user.referredBy) {
        try {
          await prisma.referral.create({
            data: {
              referrerId: user.referredBy,
              referredId: user.id,
            },
          });
        } catch (error) {
          // Silently ignore errors (e.g., duplicate, self-referral)
          console.error("Error creating referral:", error);
        }
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
    sendResetPassword: async ({ user, url, token }: { user: any; url: any; token: any }) => {
      console.info("Sending password reset email to:", JSON.stringify({ user, url, token }));
      await sendPasswordResetEmail(user.email, token);
    },
  },
  socialProviders: {
    google: {
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      clientId: env.GOOGLE_CLIENT_ID,
    },
  },
});
